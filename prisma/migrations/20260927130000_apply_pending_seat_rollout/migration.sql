-- ---------------------------------------------------------------------------
-- Bring the live database up to date with migration
-- 20260926100000_library_seat_hours_availability.
--
-- That migration was already run manually against this database, but at an
-- earlier point in its own development -- before the "no seat picker,
-- server auto-assigns" rewrite, the owner-set gym capacity, the seat_number
-- return column, and the Study Cafe -> Co-working Space rename were added to
-- it. Re-running that file verbatim now fails with "relation already exists"
-- (admin.library_seats etc. are already there, with 30 real seat rows and
-- real bookings/subscriptions against them).
--
-- This migration is therefore a targeted DELTA: it only touches the pieces
-- that differ between what's live and the current migration.sql, confirmed
-- column-by-column and function-by-function against the live database before
-- writing this file (see the session's diagnostic queries). Nothing here
-- creates a table or column that already exists, and nothing here touches
-- admin.library_seats/bookings/subscriptions data.
--
-- NOT-NULL constraints: the earlier local verification of the coworking-space
-- rename ran on Postgres 18 (embedded-postgres), which gives every NOT NULL
-- column its own named pg_constraint row. Production is Postgres 17.6, which
-- does not -- confirmed via pg_constraint before writing this file -- so the
-- two "RENAME CONSTRAINT ..._not_null" statements from the original migration
-- are correctly omitted below (they would error "constraint does not exist").
-- ---------------------------------------------------------------------------

-- 1. Owner-set capacity for non-seat categories (gym, co-working-space, exam-hub) --
ALTER TABLE "admin"."vendors" ADD COLUMN "capacity" INTEGER;
ALTER TABLE "admin"."vendors"
  ADD CONSTRAINT "vendors_capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0);

-- 2. Availability helpers (new) -----------------------------------------------

-- True when a daily slot (start time + hours) fits inside the opening window
-- of every open weekday in the week starting p_from (covers the whole schedule).
CREATE OR REPLACE FUNCTION "admin"."slot_fits_schedule"(p_vendor_id text, p_from date, p_slot time, p_hours int, p_tz text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_day date;
  v_open timestamptz;
  v_close timestamptz;
  v_s timestamptz;
  v_e timestamptz;
  v_any boolean := false;
BEGIN
  FOR v_day IN SELECT (p_from + g)::date FROM generate_series(0, 6) g LOOP
    SELECT ow.open_at, ow.close_at INTO v_open, v_close
    FROM admin.vendor_open_window(p_vendor_id, v_day) ow;
    CONTINUE WHEN v_open IS NULL;
    v_any := true;
    v_s := (v_day + p_slot) AT TIME ZONE p_tz;
    IF v_s < v_open THEN v_s := v_s + interval '1 day'; END IF;
    v_e := v_s + make_interval(hours => p_hours);
    IF v_s < v_open OR v_e > v_close THEN RETURN false; END IF;
  END LOOP;
  RETURN v_any;
END;
$$;

-- True when the seat has nothing booked in the daily slot on any day in
-- [p_from, p_to). One busy-interval scan for the whole span (not per day).
CREATE OR REPLACE FUNCTION "admin"."seat_free_for_span"(p_seat_id text, p_from date, p_to date, p_slot time, p_hours int, p_tz text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM admin.seat_busy_intervals(
      p_seat_id,
      ((p_from - 1)::timestamp AT TIME ZONE p_tz),
      ((p_to + 2)::timestamp AT TIME ZONE p_tz)
    ) bi
    JOIN generate_series(p_from::timestamp, (p_to - 1)::timestamp, interval '1 day') AS d
      ON bi."start_at" < (((d::date + p_slot) AT TIME ZONE p_tz) + make_interval(hours => p_hours))
     AND bi."end_at"   >  ((d::date + p_slot) AT TIME ZONE p_tz)
  )
$$;

-- Allocate a seat for a one-off window: "smart random". Among seats free for
-- the whole window, prefer the seat whose containing free stretch is smallest
-- (so fully-free seats stay available for 24h / long bookings); ties are
-- random. The seat row is locked (SKIP LOCKED, so concurrent bookers get
-- different seats) and overlap is re-checked after locking. NULL = none.
CREATE OR REPLACE FUNCTION "admin"."pick_seat"(p_vendor_id text, p_start timestamptz, p_end timestamptz, p_open timestamptz, p_close timestamptz)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
  v_locked text;
BEGIN
  FOR r IN
    SELECT s."id" AS sid,
      (SELECT min(fw.win_end - fw.win_start)
         FROM admin.seat_free_windows(s."id", p_open, p_close) fw
        WHERE fw.win_start <= p_start AND fw.win_end >= p_end) AS tight
    FROM admin.library_seats s
    WHERE s."vendor_id" = p_vendor_id AND s."is_active"
    ORDER BY tight ASC NULLS LAST, random()
  LOOP
    CONTINUE WHEN r.tight IS NULL;

    SELECT s."id" INTO v_locked
    FROM admin.library_seats s WHERE s."id" = r.sid
    FOR UPDATE SKIP LOCKED;
    CONTINUE WHEN v_locked IS NULL;

    IF NOT EXISTS (SELECT 1 FROM admin.seat_busy_intervals(r.sid, p_start, p_end)) THEN
      RETURN r.sid;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- Same for a subscription: a seat free at the daily slot for every day of the
-- span. Prefers seats that already have other occupancy, then random.
CREATE OR REPLACE FUNCTION "admin"."pick_seat_for_span"(p_vendor_id text, p_from date, p_to date, p_slot time, p_hours int, p_tz text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
  v_locked text;
BEGIN
  FOR r IN
    SELECT s."id" AS sid,
      (SELECT count(*) FROM admin.seat_busy_intervals(
         s."id",
         ((p_from - 1)::timestamp AT TIME ZONE p_tz),
         ((p_to + 2)::timestamp AT TIME ZONE p_tz))) AS busy_n
    FROM admin.library_seats s
    WHERE s."vendor_id" = p_vendor_id AND s."is_active"
    ORDER BY busy_n DESC, random()
  LOOP
    CONTINUE WHEN NOT admin.seat_free_for_span(r.sid, p_from, p_to, p_slot, p_hours, p_tz);

    SELECT s."id" INTO v_locked
    FROM admin.library_seats s WHERE s."id" = r.sid
    FOR UPDATE SKIP LOCKED;
    CONTINUE WHEN v_locked IS NULL;

    IF admin.seat_free_for_span(r.sid, p_from, p_to, p_slot, p_hours, p_tz) THEN
      RETURN r.sid;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- 3. Customer-facing availability: counts only, never seat identities (new) ---
-- Supersedes public.get_library_availability (the earlier per-seat-list
-- version) -- dropped at the end of this file since nothing calls it anymore.
CREATE OR REPLACE FUNCTION "public"."get_library_slot_options"(p_vendor_id text, p_date date, p_hours numeric DEFAULT NULL)
RETURNS TABLE (total_seats int, start_time text, end_time text, seats_available int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_tz text;
  v_open timestamptz;
  v_close timestamptz;
  v_total int;
  v_len interval;
  v_found boolean := false;
  r record;
BEGIN
  SELECT v."time_zone" INTO v_tz
  FROM admin.vendors v WHERE v."id" = p_vendor_id AND v."status" = 'PUBLISHED';
  IF v_tz IS NULL THEN RETURN; END IF;

  SELECT count(*)::int INTO v_total
  FROM admin.library_seats s WHERE s."vendor_id" = p_vendor_id AND s."is_active";
  IF v_total = 0 THEN RETURN; END IF;

  SELECT ow.open_at, ow.close_at INTO v_open, v_close
  FROM admin.vendor_open_window(p_vendor_id, p_date) ow;
  IF v_open IS NULL THEN
    total_seats := v_total; start_time := NULL; end_time := NULL; seats_available := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  v_len := make_interval(secs => (COALESCE(p_hours, extract(epoch FROM (v_close - v_open)) / 3600.0) * 3600)::double precision);
  IF v_len <= interval '0' THEN RETURN; END IF;

  FOR r IN
    WITH w AS (
      SELECT s."id" AS seat_id, fw.win_start, fw.win_end
      FROM admin.library_seats s
      CROSS JOIN LATERAL admin.seat_free_windows(s."id", v_open, v_close) fw
      WHERE s."vendor_id" = p_vendor_id AND s."is_active"
    ),
    -- Candidate starts: every free-stretch start, plus evenly spaced slots from
    -- opening time (00:00, 06:00, 12:00... for a 6h plan) so a fully-free seat
    -- can always be offered mid-day even when no stretch begins there.
    starts AS (
      SELECT w.win_start AS st FROM w
      UNION
      SELECT v_open + (k * v_len)
      FROM generate_series(0, floor(extract(epoch FROM (v_close - v_open)) / extract(epoch FROM v_len))::int - 1) k
    )
    SELECT starts.st AS st, count(DISTINCT w.seat_id)::int AS n
    FROM starts
    JOIN w ON w.win_start <= starts.st AND w.win_end >= starts.st + v_len
    WHERE starts.st + v_len > now()
    GROUP BY starts.st
    ORDER BY starts.st
  LOOP
    v_found := true;
    total_seats := v_total;
    start_time := to_char(r.st AT TIME ZONE v_tz, 'HH24:MI');
    end_time := to_char((r.st + v_len) AT TIME ZONE v_tz, 'HH24:MI');
    seats_available := r.n;
    RETURN NEXT;
  END LOOP;

  IF NOT v_found THEN
    total_seats := v_total; start_time := NULL; end_time := NULL; seats_available := 0;
    RETURN NEXT;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."get_library_slot_options" TO authenticated;

-- Same shape for a subscription plan: seats_available = seats free at that
-- daily slot for EVERY day of the plan (e.g. "28 seats" for a month).
CREATE OR REPLACE FUNCTION "public"."get_library_subscription_options"(p_vendor_id text, p_plan_id text)
RETURNS TABLE (total_seats int, start_time text, end_time text, seats_available int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_tz text;
  v_unit text;
  v_value int;
  v_daily int;
  v_total int;
  v_from date := now()::date;
  v_to date;
  v_day date;
  v_open timestamptz;
  v_close timestamptz;
  v_hours int;
  v_n int;
  v_found boolean := false;
  r record;
BEGIN
  SELECT v."time_zone" INTO v_tz
  FROM admin.vendors v WHERE v."id" = p_vendor_id AND v."status" = 'PUBLISHED';
  IF v_tz IS NULL THEN RETURN; END IF;

  SELECT count(*)::int INTO v_total
  FROM admin.library_seats s WHERE s."vendor_id" = p_vendor_id AND s."is_active";
  IF v_total = 0 THEN RETURN; END IF;

  SELECT p."duration_unit"::text, p."duration_value", p."daily_hours" INTO v_unit, v_value, v_daily
  FROM admin.membership_plans p
  WHERE p."id" = p_plan_id AND p."vendor_id" = p_vendor_id AND p."status" = 'ACTIVE';
  IF v_unit IS NULL OR v_unit NOT IN ('DAYS', 'MONTHS', 'YEARS') THEN RETURN; END IF;

  v_to := (now()::timestamp + CASE v_unit
    WHEN 'DAYS'   THEN make_interval(days => v_value)
    WHEN 'MONTHS' THEN make_interval(months => v_value)
    ELSE make_interval(years => v_value)
  END)::date;

  -- First open day in the coming week defines the opening window / default hours.
  FOR v_day IN SELECT (v_from + g)::date FROM generate_series(0, 6) g LOOP
    SELECT ow.open_at, ow.close_at INTO v_open, v_close
    FROM admin.vendor_open_window(p_vendor_id, v_day) ow;
    EXIT WHEN v_open IS NOT NULL;
  END LOOP;

  IF v_open IS NULL THEN
    total_seats := v_total; start_time := NULL; end_time := NULL; seats_available := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  v_hours := COALESCE(v_daily, ceil(extract(epoch FROM (v_close - v_open)) / 3600.0)::int);

  FOR r IN
    SELECT DISTINCT c.t AS slot_t
    FROM (
      SELECT ((v_open + (k * make_interval(hours => v_hours))) AT TIME ZONE v_tz)::time AS t
      FROM generate_series(0, floor(extract(epoch FROM (v_close - v_open)) / (v_hours * 3600.0))::int - 1) k
      UNION
      SELECT (fw.win_start AT TIME ZONE v_tz)::time
      FROM admin.library_seats s
      CROSS JOIN LATERAL admin.seat_free_windows(s."id", v_open, v_close) fw
      WHERE s."vendor_id" = p_vendor_id AND s."is_active"
    ) c
    ORDER BY slot_t
  LOOP
    CONTINUE WHEN NOT admin.slot_fits_schedule(p_vendor_id, v_from, r.slot_t, v_hours, v_tz);

    SELECT count(*)::int INTO v_n
    FROM admin.library_seats s
    WHERE s."vendor_id" = p_vendor_id AND s."is_active"
      AND admin.seat_free_for_span(s."id", v_from, v_to, r.slot_t, v_hours, v_tz);

    IF v_n > 0 THEN
      v_found := true;
      total_seats := v_total;
      start_time := to_char(r.slot_t, 'HH24:MI');
      end_time := to_char(r.slot_t + make_interval(hours => v_hours), 'HH24:MI');
      seats_available := v_n;
      RETURN NEXT;
    END IF;
  END LOOP;

  IF NOT v_found THEN
    total_seats := v_total; start_time := NULL; end_time := NULL; seats_available := 0;
    RETURN NEXT;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."get_library_subscription_options" TO authenticated;

-- 4. create_customer_booking: seat auto-assigned + owner capacity + seat_number
-- Live signature is unchanged (still 9 text args) but the return type is
-- gaining a column (seat_number), which CREATE OR REPLACE cannot do -- an
-- explicit DROP of the exact live signature is required first.
DROP FUNCTION IF EXISTS "public"."create_customer_booking"(text, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION "public"."create_customer_booking"(
  p_vendor_id text,
  p_plan_id text,
  p_booking_code text,
  p_booking_date text,
  p_date_label text,
  p_time_slot text,
  p_time_label text,
  p_seat_id text DEFAULT NULL,
  p_start_time text DEFAULT NULL
-- seat_number is the assigned seat's label ("Regular 5") for the customer to
-- find it in the library -- NULL for legacy (non-seat) vendors.
) RETURNS TABLE (id text, booking_code text, seat_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_vendor_name text;
  v_tz text;
  v_vendor_capacity int;
  v_plan_name text;
  v_plan_price numeric;
  v_plan_unit text;
  v_plan_value int;
  v_plan_daily_hours int;
  v_id text := gen_random_uuid()::text;
  v_platform_fee CONSTANT numeric := 6;
  v_default_capacity CONSTANT int := 20;
  v_slot_date date;
  v_start_time time;
  v_end_time time;
  v_capacity int;
  v_locked_slot_id text;
  v_has_seats boolean;
  v_open timestamptz;
  v_close timestamptz;
  v_hours numeric;
  v_start timestamptz;
  v_end timestamptz;
  v_seat_id text;
  v_seat_label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT v."name", v."time_zone", v."capacity" INTO v_vendor_name, v_tz, v_vendor_capacity
  FROM admin.vendors v
  WHERE v."id" = p_vendor_id AND v."status" = 'PUBLISHED';

  IF v_vendor_name IS NULL THEN
    RAISE EXCEPTION 'Listing not available for booking';
  END IF;

  SELECT p."name", p."price", p."duration_unit"::text, p."duration_value", p."daily_hours"
    INTO v_plan_name, v_plan_price, v_plan_unit, v_plan_value, v_plan_daily_hours
  FROM admin.membership_plans p
  WHERE p."id" = p_plan_id AND p."vendor_id" = p_vendor_id AND p."status" = 'ACTIVE';

  IF v_plan_name IS NULL THEN
    RAISE EXCEPTION 'Plan not available for this listing';
  END IF;

  v_slot_date := p_booking_date::date;

  SELECT EXISTS (SELECT 1 FROM admin.library_seats s WHERE s."vendor_id" = p_vendor_id AND s."is_active")
    INTO v_has_seats;

  IF v_has_seats THEN
    -- ---------------- seat + time path ----------------
    SELECT ow.open_at, ow.close_at INTO v_open, v_close
    FROM admin.vendor_open_window(p_vendor_id, v_slot_date) ow;
    IF v_open IS NULL THEN
      RAISE EXCEPTION 'This library is closed on the selected date';
    END IF;

    IF v_plan_unit = 'HOURS' THEN
      v_hours := v_plan_value;
    ELSIF v_plan_unit = 'DAYS' AND v_plan_value = 1 THEN
      v_hours := COALESCE(v_plan_daily_hours, extract(epoch FROM (v_close - v_open)) / 3600.0);
    ELSE
      RAISE EXCEPTION 'This plan is a subscription. Please subscribe instead of booking a single day.';
    END IF;

    IF p_start_time IS NULL THEN
      v_start := v_open;
    ELSE
      v_start := (v_slot_date + p_start_time::time) AT TIME ZONE v_tz;
      -- A time earlier than opening belongs to the next calendar day of an
      -- overnight window (e.g. open 22:00, book 02:00).
      IF v_start < v_open THEN v_start := v_start + interval '1 day'; END IF;
    END IF;
    v_end := v_start + make_interval(secs => (v_hours * 3600)::double precision);

    IF v_start < v_open OR v_end > v_close THEN
      RAISE EXCEPTION 'The selected time is outside the library''s opening hours';
    END IF;

    IF v_end <= now() THEN
      RAISE EXCEPTION 'The selected time has already passed';
    END IF;

    IF p_seat_id IS NULL THEN
      v_seat_id := admin.pick_seat(p_vendor_id, v_start, v_end, v_open, v_close);
      IF v_seat_id IS NULL THEN
        RAISE EXCEPTION 'No seats are available for that slot. Please choose another time.';
      END IF;
      -- The customer never picks a seat, but they do need to know which one
      -- they were assigned so they can find it in the library.
      SELECT s."label" INTO v_seat_label FROM admin.library_seats s WHERE s."id" = v_seat_id;
    ELSE
      -- Explicit seat (admin/tools): serialise writers, then check overlap.
      SELECT s."label" INTO v_seat_label
      FROM admin.library_seats s
      WHERE s."id" = p_seat_id AND s."vendor_id" = p_vendor_id AND s."is_active"
      FOR UPDATE;
      IF v_seat_label IS NULL THEN
        RAISE EXCEPTION 'Seat not available';
      END IF;
      IF EXISTS (SELECT 1 FROM admin.seat_busy_intervals(p_seat_id, v_start, v_end)) THEN
        RAISE EXCEPTION 'This seat is already booked for the selected time. Please choose another seat or time.';
      END IF;
      v_seat_id := p_seat_id;
    END IF;

    INSERT INTO admin.bookings (
      "id", "user_id", "vendor_id", "plan_id", "slot_id", "seat_id", "start_at", "end_at", "duration_hours",
      "booking_date", "amount", "status",
      "booking_code", "vendor_name", "date_label", "time_slot", "time_label", "seat_type", "seat_label",
      "updated_at"
    ) VALUES (
      v_id, auth.uid()::text, p_vendor_id, p_plan_id, NULL, v_seat_id, v_start, v_end, v_hours,
      p_booking_date::timestamp, v_plan_price + v_platform_fee, 'PENDING',
      p_booking_code, v_vendor_name, p_date_label, 'custom',
      to_char(v_start AT TIME ZONE v_tz, 'HH24:MI') || ' - ' || to_char(v_end AT TIME ZONE v_tz, 'HH24:MI'),
      p_plan_id, v_plan_name,
      now()
    );

    RETURN QUERY SELECT v_id, p_booking_code, v_seat_label;
    RETURN;
  END IF;

  -- ---------------- legacy bucket path (vendors without seats) ----------------
  CASE p_time_slot
    WHEN 'morning'   THEN v_start_time := TIME '06:00'; v_end_time := TIME '12:00';
    WHEN 'afternoon' THEN v_start_time := TIME '12:00'; v_end_time := TIME '17:00';
    WHEN 'evening'   THEN v_start_time := TIME '17:00'; v_end_time := TIME '22:00';
    WHEN 'night'     THEN v_start_time := TIME '22:00'; v_end_time := TIME '06:00';
    ELSE RAISE EXCEPTION 'Unknown time slot: %', p_time_slot;
  END CASE;

  -- Owner-set vendor.capacity (gym/co-working-space/exam-hub) wins over the seat-type
  -- sum (library vendors always take the seat path above, never reach here) and
  -- over the hardcoded default.
  SELECT COALESCE(v_vendor_capacity, SUM(lst."total_count"), v_default_capacity) INTO v_capacity
  FROM admin.library_seat_types lst
  WHERE lst."vendor_id" = p_vendor_id;

  INSERT INTO admin.booking_slots
    ("id", "vendor_id", "slot_date", "start_time", "end_time", "capacity", "available_capacity", "status")
  VALUES
    (gen_random_uuid()::text, p_vendor_id, v_slot_date, v_start_time, v_end_time, v_capacity, v_capacity, 'ACTIVE')
  ON CONFLICT ("vendor_id", "slot_date", "start_time", "end_time") DO NOTHING;

  UPDATE admin.booking_slots AS bs
  SET "available_capacity" = bs."available_capacity" - 1
  WHERE bs."vendor_id" = p_vendor_id
    AND bs."slot_date" = v_slot_date
    AND bs."start_time" = v_start_time
    AND bs."end_time" = v_end_time
    AND bs."available_capacity" > 0
    AND bs."status" = 'ACTIVE'
  RETURNING bs."id" INTO v_locked_slot_id;

  IF v_locked_slot_id IS NULL THEN
    RAISE EXCEPTION 'This time slot is fully booked. Please choose another slot.';
  END IF;

  INSERT INTO admin.bookings (
    "id", "user_id", "vendor_id", "plan_id", "slot_id", "booking_date", "amount", "status",
    "booking_code", "vendor_name", "date_label", "time_slot", "time_label", "seat_type", "seat_label",
    "updated_at"
  ) VALUES (
    v_id, auth.uid()::text, p_vendor_id, p_plan_id, v_locked_slot_id, p_booking_date::timestamp, v_plan_price + v_platform_fee, 'PENDING',
    p_booking_code, v_vendor_name, p_date_label, p_time_slot, p_time_label, p_plan_id, v_plan_name,
    now()
  );

  RETURN QUERY SELECT v_id, p_booking_code, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."create_customer_booking" TO authenticated;

-- 5. create_customer_subscription: seat auto-assigned + seat_number -----------
-- Live signature is unchanged (still 4 text args) but the return type is
-- gaining a column (seat_number) -- same reasoning as above.
DROP FUNCTION IF EXISTS "public"."create_customer_subscription"(text, text, text, text);

CREATE OR REPLACE FUNCTION "public"."create_customer_subscription"(
  p_vendor_id text,
  p_plan_id text,
  p_seat_id text DEFAULT NULL,
  p_start_time text DEFAULT NULL
-- seat_number is the assigned seat's label ("Regular 5") for the customer to
-- find it in the library -- NULL for legacy (non-seat) vendors.
) RETURNS TABLE (id text, start_date text, end_date text, seat_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_vendor_name text;
  v_tz text;
  v_plan_name text;
  v_plan_price numeric;
  v_duration_value int;
  v_duration_unit text;
  v_daily_hours int;
  v_customer_name text;
  v_id text := gen_random_uuid()::text;
  v_start timestamp := now();
  v_end timestamp;
  v_has_seats boolean;
  v_slot_start time;
  v_slot_hours int;
  v_seat_id text;
  v_seat_label text;
  v_day date;
  v_close timestamptz;
  v_first_open timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT v."name", v."time_zone" INTO v_vendor_name, v_tz
  FROM admin.vendors v
  WHERE v."id" = p_vendor_id AND v."status" = 'PUBLISHED';

  IF v_vendor_name IS NULL THEN
    RAISE EXCEPTION 'Listing not available';
  END IF;

  SELECT p."name", p."price", p."duration_value", p."duration_unit"::text, p."daily_hours"
    INTO v_plan_name, v_plan_price, v_duration_value, v_duration_unit, v_daily_hours
  FROM admin.membership_plans p
  WHERE p."id" = p_plan_id AND p."vendor_id" = p_vendor_id AND p."status" = 'ACTIVE';

  IF v_plan_name IS NULL THEN
    RAISE EXCEPTION 'Plan not available for this listing';
  END IF;

  -- SESSIONS / HOURS plans are visit passes, not calendar ranges.
  IF v_duration_unit NOT IN ('DAYS', 'MONTHS', 'YEARS') THEN
    RAISE EXCEPTION 'This plan is not available as a subscription';
  END IF;

  v_end := CASE v_duration_unit
    WHEN 'DAYS'   THEN v_start + (v_duration_value || ' days')::interval
    WHEN 'MONTHS' THEN v_start + (v_duration_value || ' months')::interval
    WHEN 'YEARS'  THEN v_start + (v_duration_value || ' years')::interval
  END;

  SELECT COALESCE(NULLIF(pr."full_name", ''), 'Reader') INTO v_customer_name
  FROM public.profiles pr WHERE pr."id" = auth.uid();

  -- Lazily expire the caller's own stale ACTIVE row for this vendor before
  -- enforcing the one-active-per-vendor rule (see 20260919100000_...).
  UPDATE admin.subscriptions s
  SET "status" = 'EXPIRED', "updated_at" = now()
  WHERE s."user_id" = auth.uid()::text AND s."vendor_id" = p_vendor_id
    AND s."status" = 'ACTIVE' AND s."end_date" < now();

  IF EXISTS (
    SELECT 1 FROM admin.subscriptions s
    WHERE s."user_id" = auth.uid()::text AND s."vendor_id" = p_vendor_id AND s."status" = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'You already have an active subscription with this listing';
  END IF;

  SELECT EXISTS (SELECT 1 FROM admin.library_seats s WHERE s."vendor_id" = p_vendor_id AND s."is_active")
    INTO v_has_seats;

  IF v_has_seats THEN
    -- Opening window of the first open day sets the default start and length.
    FOR v_day IN SELECT (v_start::date + g)::date FROM generate_series(0, 6) g LOOP
      SELECT ow.open_at, ow.close_at INTO v_first_open, v_close
      FROM admin.vendor_open_window(p_vendor_id, v_day) ow;
      EXIT WHEN v_first_open IS NOT NULL;
    END LOOP;
    IF v_first_open IS NULL THEN
      RAISE EXCEPTION 'This library has no opening hours configured';
    END IF;

    IF p_start_time IS NULL THEN
      v_slot_start := (v_first_open AT TIME ZONE v_tz)::time;
    ELSE
      v_slot_start := p_start_time::time;
    END IF;
    v_slot_hours := COALESCE(v_daily_hours, ceil(extract(epoch FROM (v_close - v_first_open)) / 3600.0)::int);

    IF NOT admin.slot_fits_schedule(p_vendor_id, v_start::date, v_slot_start, v_slot_hours, v_tz) THEN
      RAISE EXCEPTION 'The selected daily time slot is outside the library''s opening hours';
    END IF;

    IF p_seat_id IS NULL THEN
      v_seat_id := admin.pick_seat_for_span(p_vendor_id, v_start::date, v_end::date, v_slot_start, v_slot_hours, v_tz);
      IF v_seat_id IS NULL THEN
        RAISE EXCEPTION 'No seats are available at that daily time for the whole plan. Please choose another time.';
      END IF;
      -- The customer never picks a seat, but they do need to know which one
      -- they were assigned so they can find it in the library.
      SELECT s."label" INTO v_seat_label FROM admin.library_seats s WHERE s."id" = v_seat_id;
    ELSE
      SELECT s."label" INTO v_seat_label
      FROM admin.library_seats s
      WHERE s."id" = p_seat_id AND s."vendor_id" = p_vendor_id AND s."is_active"
      FOR UPDATE;
      IF v_seat_label IS NULL THEN
        RAISE EXCEPTION 'Seat not available';
      END IF;
      IF NOT admin.seat_free_for_span(p_seat_id, v_start::date, v_end::date, v_slot_start, v_slot_hours, v_tz) THEN
        RAISE EXCEPTION 'This seat is not free at that time for the whole subscription. Please choose another seat or time.';
      END IF;
      v_seat_id := p_seat_id;
    END IF;
  END IF;

  INSERT INTO admin.subscriptions (
    "id", "user_id", "vendor_id", "plan_id", "start_date", "end_date", "status", "amount_paid",
    "customer_name", "vendor_name", "plan_name", "seat_id", "slot_start_time", "slot_hours", "updated_at"
  ) VALUES (
    v_id, auth.uid()::text, p_vendor_id, p_plan_id, v_start, v_end, 'ACTIVE', v_plan_price,
    COALESCE(v_customer_name, 'Reader'), v_vendor_name, v_plan_name,
    CASE WHEN v_has_seats THEN v_seat_id END,
    CASE WHEN v_has_seats THEN v_slot_start END,
    CASE WHEN v_has_seats THEN v_slot_hours END,
    now()
  );

  RETURN QUERY SELECT
    v_id,
    to_char(v_start, 'YYYY-MM-DD"T"HH24:MI:SS'),
    to_char(v_end, 'YYYY-MM-DD"T"HH24:MI:SS'),
    CASE WHEN v_has_seats THEN v_seat_label END;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."create_customer_subscription" TO authenticated;

-- 6. get_slot_availability: same owner-capacity fallback as create_customer_booking
CREATE OR REPLACE FUNCTION "public"."get_slot_availability"(
  p_vendor_id text,
  p_slot_date date
) RETURNS TABLE (
  time_slot text,
  start_time time,
  end_time time,
  capacity int,
  available_capacity int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_default_capacity CONSTANT int := 20;
  v_vendor_capacity int;
  v_capacity int;
BEGIN
  SELECT v."capacity" INTO v_vendor_capacity
  FROM admin.vendors v WHERE v."id" = p_vendor_id;

  SELECT COALESCE(v_vendor_capacity, SUM(lst."total_count"), v_default_capacity) INTO v_capacity
  FROM admin.library_seat_types lst
  WHERE lst."vendor_id" = p_vendor_id;

  RETURN QUERY
  SELECT
    bucket.slot,
    bucket.s,
    bucket.e,
    COALESCE(bs."capacity", v_capacity),
    COALESCE(bs."available_capacity", v_capacity)
  FROM (VALUES
    ('morning',   TIME '06:00', TIME '12:00'),
    ('afternoon', TIME '12:00', TIME '17:00'),
    ('evening',   TIME '17:00', TIME '22:00'),
    ('night',     TIME '22:00', TIME '06:00')
  ) AS bucket(slot, s, e)
  LEFT JOIN admin.booking_slots bs
    ON bs."vendor_id" = p_vendor_id
    AND bs."slot_date" = p_slot_date
    AND bs."start_time" = bucket.s
    AND bs."end_time" = bucket.e
    AND bs."status" = 'ACTIVE';
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."get_slot_availability" TO authenticated;

-- Superseded by get_library_slot_options -- nothing in the app calls this anymore.
DROP FUNCTION IF EXISTS "public"."get_library_availability"(text, date);

-- 7. Rename "Study Cafe" category to "Co-working Space" -----------------------
UPDATE "admin"."vendor_categories"
SET "name" = 'Co-working Space', "slug" = 'co-working-space'
WHERE "slug" = 'study-cafe';

ALTER TABLE "admin"."study_cafe_details" RENAME TO "coworking_space_details";
ALTER TABLE "admin"."coworking_space_details"
  RENAME CONSTRAINT "study_cafe_details_pkey" TO "coworking_space_details_pkey";
ALTER TABLE "admin"."coworking_space_details"
  RENAME CONSTRAINT "study_cafe_details_vendor_id_fkey" TO "coworking_space_details_vendor_id_fkey";
ALTER INDEX "admin"."study_cafe_details_vendor_id_key" RENAME TO "coworking_space_details_vendor_id_key";
-- (No RENAME CONSTRAINT for the auto-named NOT NULL constraints here -- see
-- the note at the top of this file: Postgres 17 doesn't create them.)
