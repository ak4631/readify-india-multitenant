-- ---------------------------------------------------------------------------
-- Library seat availability by seat + time (free hours per seat).
--
-- Replaces the per-bucket counter model (admin.booking_slots) for vendors that
-- have library seats. A booking/subscription now occupies a specific seat for
-- a concrete time window; availability is derived by subtracting those windows
-- from the vendor's opening window for the day.
--
-- Vendors WITHOUT admin.library_seats rows (gyms, etc.) keep the legacy bucket
-- behaviour inside create_customer_booking / get_slot_availability.
--
-- Concurrency: every writer goes through the SECURITY DEFINER RPCs below, and
-- each takes a row lock on the chosen admin.library_seats row before checking
-- for overlap, so two customers can never take the same seat/time window.
-- ---------------------------------------------------------------------------

-- 1. Plans can be hourly (e.g. "6 hours") ------------------------------------
ALTER TYPE "admin"."DurationUnit" ADD VALUE IF NOT EXISTS 'HOURS';

-- Hours per day a DAYS/MONTHS/YEARS (subscription) plan occupies its seat.
-- NULL = the whole opening window of the day.
ALTER TABLE "admin"."membership_plans" ADD COLUMN "daily_hours" INTEGER;
ALTER TABLE "admin"."membership_plans"
  ADD CONSTRAINT "membership_plans_daily_hours_range" CHECK ("daily_hours" IS NULL OR "daily_hours" BETWEEN 1 AND 24);

-- 2. Vendor timezone (opening hours are wall-clock times) --------------------
ALTER TABLE "admin"."vendors" ADD COLUMN "time_zone" TEXT NOT NULL DEFAULT 'Asia/Kolkata';

-- 3. Individual seats --------------------------------------------------------
CREATE TABLE "admin"."library_seats" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "seat_type_id" TEXT,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_seats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "library_seats_vendor_id_label_key" ON "admin"."library_seats"("vendor_id", "label");
CREATE INDEX "library_seats_vendor_id_idx" ON "admin"."library_seats"("vendor_id");

ALTER TABLE "admin"."library_seats" ADD CONSTRAINT "library_seats_vendor_id_fkey"
  FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin"."library_seats" ADD CONSTRAINT "library_seats_seat_type_id_fkey"
  FOREIGN KEY ("seat_type_id") REFERENCES "admin"."library_seat_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Bookings / subscriptions carry seat + time window -----------------------
ALTER TABLE "admin"."bookings"
  ADD COLUMN "seat_id" TEXT,
  ADD COLUMN "start_at" TIMESTAMPTZ(3),
  ADD COLUMN "end_at" TIMESTAMPTZ(3),
  ADD COLUMN "duration_hours" DECIMAL(5,2);

ALTER TABLE "admin"."bookings" ADD CONSTRAINT "bookings_seat_id_fkey"
  FOREIGN KEY ("seat_id") REFERENCES "admin"."library_seats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "bookings_seat_id_start_at_idx" ON "admin"."bookings"("seat_id", "start_at");

ALTER TABLE "admin"."subscriptions"
  ADD COLUMN "seat_id" TEXT,
  ADD COLUMN "slot_start_time" TIME,
  ADD COLUMN "slot_hours" INTEGER;

ALTER TABLE "admin"."subscriptions" ADD CONSTRAINT "subscriptions_seat_id_fkey"
  FOREIGN KEY ("seat_id") REFERENCES "admin"."library_seats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "subscriptions_seat_id_idx" ON "admin"."subscriptions"("seat_id");

-- 5. Keep seats in sync with admin.library_seat_types.total_count ------------
-- Admin edits "Regular: 20" in the seat-type UI; these triggers materialise
-- that as 20 seat rows so nothing else (admin actions) has to change.
CREATE OR REPLACE FUNCTION "admin"."sync_seats_for_type"(p_type_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_vendor_id text;
  v_name text;
  v_target int;
  v_active int;
  v_total int;
  v_excess int;
  v_deactivated int;
  v_seat_id text;
  i int;
BEGIN
  SELECT t."vendor_id", t."name", t."total_count" INTO v_vendor_id, v_name, v_target
  FROM admin.library_seat_types t WHERE t."id" = p_type_id;
  IF v_vendor_id IS NULL THEN RETURN; END IF;

  SELECT count(*) FILTER (WHERE s."is_active"), count(*) INTO v_active, v_total
  FROM admin.library_seats s WHERE s."seat_type_id" = p_type_id;

  IF v_active < v_target THEN
    -- Reuse previously deactivated seats first, then create new ones.
    UPDATE admin.library_seats s SET "is_active" = true
    WHERE s."id" IN (
      SELECT s2."id" FROM admin.library_seats s2
      WHERE s2."seat_type_id" = p_type_id AND NOT s2."is_active"
      ORDER BY s2."created_at" LIMIT (v_target - v_active)
    );
    GET DIAGNOSTICS v_deactivated = ROW_COUNT;
    v_active := v_active + v_deactivated;

    FOR i IN 1..GREATEST(v_target - v_active, 0) LOOP
      v_total := v_total + 1;
      INSERT INTO admin.library_seats ("id", "vendor_id", "seat_type_id", "label")
      VALUES (gen_random_uuid()::text, v_vendor_id, p_type_id, v_name || ' ' || v_total)
      ON CONFLICT ("vendor_id", "label") DO NOTHING;
    END LOOP;
  ELSIF v_active > v_target THEN
    v_excess := v_active - v_target;
    -- Only seats with no current/future occupancy can be removed.
    WITH removable AS (
      SELECT s."id" FROM admin.library_seats s
      WHERE s."seat_type_id" = p_type_id AND s."is_active"
        AND NOT EXISTS (
          SELECT 1 FROM admin.bookings b
          WHERE b."seat_id" = s."id" AND b."status" IN ('PENDING', 'CONFIRMED') AND b."end_at" > now()
        )
        AND NOT EXISTS (
          SELECT 1 FROM admin.subscriptions sub
          WHERE sub."seat_id" = s."id" AND sub."status" = 'ACTIVE' AND sub."end_date" > now()
        )
      ORDER BY s."created_at" DESC
      LIMIT v_excess
    )
    UPDATE admin.library_seats s SET "is_active" = false
    WHERE s."id" IN (SELECT "id" FROM removable);
    GET DIAGNOSTICS v_deactivated = ROW_COUNT;

    IF v_deactivated < v_excess THEN
      RAISE EXCEPTION 'Cannot reduce "%" seats to %: some seats have active bookings or subscriptions', v_name, v_target;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "admin"."trg_sync_seats_after_type_change"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM admin.sync_seats_for_type(NEW."id");
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "admin"."trg_deactivate_seats_before_type_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM admin.library_seats s
    WHERE s."seat_type_id" = OLD."id"
      AND (
        EXISTS (SELECT 1 FROM admin.bookings b WHERE b."seat_id" = s."id" AND b."status" IN ('PENDING', 'CONFIRMED') AND b."end_at" > now())
        OR EXISTS (SELECT 1 FROM admin.subscriptions sub WHERE sub."seat_id" = s."id" AND sub."status" = 'ACTIVE' AND sub."end_date" > now())
      )
  ) THEN
    RAISE EXCEPTION 'Cannot delete seat type "%": some of its seats have active bookings or subscriptions', OLD."name";
  END IF;
  UPDATE admin.library_seats SET "is_active" = false WHERE "seat_type_id" = OLD."id";
  RETURN OLD;
END;
$$;

CREATE TRIGGER "library_seat_types_sync_seats"
  AFTER INSERT OR UPDATE OF "total_count" ON "admin"."library_seat_types"
  FOR EACH ROW EXECUTE FUNCTION "admin"."trg_sync_seats_after_type_change"();

CREATE TRIGGER "library_seat_types_deactivate_seats"
  BEFORE DELETE ON "admin"."library_seat_types"
  FOR EACH ROW EXECUTE FUNCTION "admin"."trg_deactivate_seats_before_type_delete"();

-- Backfill seats for existing seat types.
INSERT INTO "admin"."library_seats" ("id", "vendor_id", "seat_type_id", "label")
SELECT gen_random_uuid()::text, t."vendor_id", t."id", t."name" || ' ' || n
FROM "admin"."library_seat_types" t
CROSS JOIN LATERAL generate_series(1, t."total_count") AS n
ON CONFLICT ("vendor_id", "label") DO NOTHING;

-- 6. Time helpers -------------------------------------------------------------

-- Opening window for a vendor on a calendar date, as timestamptz in the
-- vendor's timezone. No row = closed. No schedule configured = 06:00-22:00
-- (the hours the old fixed buckets assumed). close <= open, or 23:59+, means
-- the window runs to the next midnight / next day (so 00:00-00:00 = 24h).
CREATE OR REPLACE FUNCTION "admin"."vendor_open_window"(p_vendor_id text, p_date date)
RETURNS TABLE (open_at timestamptz, close_at timestamptz)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tz text;
  v_open time;
  v_close time;
  v_closed boolean;
  v_open_ts timestamp;
  v_close_ts timestamp;
BEGIN
  SELECT v."time_zone" INTO v_tz FROM admin.vendors v WHERE v."id" = p_vendor_id;
  IF v_tz IS NULL THEN RETURN; END IF;

  SELECT s."open_time", s."close_time", s."is_closed" INTO v_open, v_close, v_closed
  FROM admin.vendor_schedules s
  WHERE s."vendor_id" = p_vendor_id
    AND s."day_of_week"::text = upper(to_char(p_date, 'FMDay'));

  IF NOT FOUND THEN
    v_open := TIME '06:00'; v_close := TIME '22:00'; v_closed := false;
  END IF;
  IF v_closed THEN RETURN; END IF;

  v_open_ts := p_date + v_open;
  IF v_close >= TIME '23:59' THEN
    v_close_ts := (p_date + 1) + TIME '00:00';
  ELSE
    v_close_ts := p_date + v_close;
    IF v_close_ts <= v_open_ts THEN v_close_ts := v_close_ts + interval '1 day'; END IF;
  END IF;

  open_at := v_open_ts AT TIME ZONE v_tz;
  close_at := v_close_ts AT TIME ZONE v_tz;
  RETURN NEXT;
END;
$$;

-- Every interval a seat is occupied inside [p_from, p_to): live bookings plus
-- each day of every active subscription. Cancelled/expired rows drop out, and
-- a booking frees its seat automatically once end_at has passed.
CREATE OR REPLACE FUNCTION "admin"."seat_busy_intervals"(p_seat_id text, p_from timestamptz, p_to timestamptz)
RETURNS TABLE (start_at timestamptz, end_at timestamptz, source text, ref_id text)
LANGUAGE sql
STABLE
AS $$
  SELECT x.s, x.e, x.src, x.ref
  FROM (
    SELECT b."start_at" AS s, b."end_at" AS e, 'booking'::text AS src, b."id" AS ref
    FROM admin.bookings b
    WHERE b."seat_id" = p_seat_id
      AND b."status" IN ('PENDING', 'CONFIRMED')
      AND b."start_at" IS NOT NULL

    UNION ALL

    SELECT
      ((d::date + sub."slot_start_time") AT TIME ZONE v."time_zone") AS s,
      ((d::date + sub."slot_start_time") AT TIME ZONE v."time_zone") + make_interval(hours => sub."slot_hours") AS e,
      'subscription'::text AS src,
      sub."id" AS ref
    FROM admin.subscriptions sub
    JOIN admin.vendors v ON v."id" = sub."vendor_id"
    CROSS JOIN LATERAL generate_series(
      GREATEST(sub."start_date"::date, ((p_from AT TIME ZONE v."time_zone")::date - 1))::timestamp,
      LEAST((sub."end_date"::date - 1), (p_to AT TIME ZONE v."time_zone")::date)::timestamp,
      interval '1 day'
    ) AS d
    WHERE sub."seat_id" = p_seat_id
      AND sub."status" = 'ACTIVE'
      AND sub."slot_start_time" IS NOT NULL
      AND sub."slot_hours" IS NOT NULL
  ) x
  WHERE x.s < p_to AND x.e > p_from
$$;

-- Free gaps for one seat inside [p_open, p_close).
CREATE OR REPLACE FUNCTION "admin"."seat_free_windows"(p_seat_id text, p_open timestamptz, p_close timestamptz)
RETURNS TABLE (win_start timestamptz, win_end timestamptz)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_cursor timestamptz := p_open;
  r record;
BEGIN
  FOR r IN
    SELECT bi."start_at" AS s, bi."end_at" AS e
    FROM admin.seat_busy_intervals(p_seat_id, p_open, p_close) bi
    ORDER BY bi."start_at"
  LOOP
    IF r.s > v_cursor THEN
      win_start := v_cursor; win_end := r.s; RETURN NEXT;
    END IF;
    IF r.e > v_cursor THEN v_cursor := r.e; END IF;
  END LOOP;
  IF v_cursor < p_close THEN
    win_start := v_cursor; win_end := p_close; RETURN NEXT;
  END IF;
END;
$$;

-- 7. get_library_availability ----------------------------------------------
-- One row per active seat with its free windows for the day, e.g. a 24h
-- library: a seat with a 6h booking from 06:00 returns
--   free_hours 18, free_windows [{start:"00:00",end:"06:00",hours:6},{start:"12:00",...}]
-- Times are vendor-local "HH24:MI" strings so the client never does tz math.
CREATE OR REPLACE FUNCTION "public"."get_library_availability"(p_vendor_id text, p_date date)
RETURNS TABLE (
  seat_id text,
  seat_label text,
  seat_type text,
  open_time text,
  close_time text,
  total_hours numeric,
  free_hours numeric,
  free_windows jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_tz text;
  v_open timestamptz;
  v_close timestamptz;
  r record;
  v_windows jsonb;
  v_free numeric;
BEGIN
  SELECT v."time_zone" INTO v_tz FROM admin.vendors v WHERE v."id" = p_vendor_id AND v."status" = 'PUBLISHED';
  IF v_tz IS NULL THEN RETURN; END IF;

  SELECT ow.open_at, ow.close_at INTO v_open, v_close FROM admin.vendor_open_window(p_vendor_id, p_date) ow;
  IF v_open IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT s."id" AS sid, s."label" AS slabel, t."name" AS tname
    FROM admin.library_seats s
    LEFT JOIN admin.library_seat_types t ON t."id" = s."seat_type_id"
    WHERE s."vendor_id" = p_vendor_id AND s."is_active"
    ORDER BY s."created_at", s."label"
  LOOP
    SELECT
      COALESCE(jsonb_agg(jsonb_build_object(
        'start', to_char(w.win_start AT TIME ZONE v_tz, 'HH24:MI'),
        'end',   to_char(w.win_end AT TIME ZONE v_tz, 'HH24:MI'),
        'hours', round(extract(epoch FROM (w.win_end - w.win_start)) / 3600.0, 2)
      ) ORDER BY w.win_start), '[]'::jsonb),
      COALESCE(sum(extract(epoch FROM (w.win_end - w.win_start)) / 3600.0), 0)
    INTO v_windows, v_free
    FROM admin.seat_free_windows(r.sid, v_open, v_close) w;

    seat_id := r.sid;
    seat_label := r.slabel;
    seat_type := r.tname;
    open_time := to_char(v_open AT TIME ZONE v_tz, 'HH24:MI');
    close_time := to_char(v_close AT TIME ZONE v_tz, 'HH24:MI');
    total_hours := round(extract(epoch FROM (v_close - v_open)) / 3600.0, 2);
    free_hours := round(v_free, 2);
    free_windows := v_windows;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."get_library_availability" TO authenticated;

-- 8. create_customer_booking: seat + time aware --------------------------------
-- Signature gains p_seat_id / p_start_time (vendor-local "HH24:MI", default =
-- the day's opening time). For vendors without library seats the legacy
-- bucket path below is unchanged.
DROP FUNCTION IF EXISTS "public"."create_customer_booking"(text, text, text, text, text, text, text);

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
) RETURNS TABLE (id text, booking_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_vendor_name text;
  v_tz text;
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
  v_seat_label text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT v."name", v."time_zone" INTO v_vendor_name, v_tz
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
    IF p_seat_id IS NULL THEN
      RAISE EXCEPTION 'Please choose a seat';
    END IF;

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

    -- Serialise all writers for this seat, then check for overlap.
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

    INSERT INTO admin.bookings (
      "id", "user_id", "vendor_id", "plan_id", "slot_id", "seat_id", "start_at", "end_at", "duration_hours",
      "booking_date", "amount", "status",
      "booking_code", "vendor_name", "date_label", "time_slot", "time_label", "seat_type", "seat_label",
      "updated_at"
    ) VALUES (
      v_id, auth.uid()::text, p_vendor_id, p_plan_id, NULL, p_seat_id, v_start, v_end, v_hours,
      p_booking_date::timestamp, v_plan_price + v_platform_fee, 'PENDING',
      p_booking_code, v_vendor_name, p_date_label, 'custom',
      to_char(v_start AT TIME ZONE v_tz, 'HH24:MI') || ' - ' || to_char(v_end AT TIME ZONE v_tz, 'HH24:MI'),
      p_plan_id, v_plan_name,
      now()
    );

    RETURN QUERY SELECT v_id, p_booking_code;
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

  SELECT COALESCE(SUM(lst."total_count"), v_default_capacity) INTO v_capacity
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

  RETURN QUERY SELECT v_id, p_booking_code;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."create_customer_booking" TO authenticated;

-- 9. create_customer_subscription: seat + daily time slot ---------------------
-- The customer picks a seat and a daily start time (default: opening time);
-- the plan's daily_hours (or the whole opening window) sets the length. The
-- seat/time is reserved every day of the subscription; the whole span is
-- conflict-checked up front.
DROP FUNCTION IF EXISTS "public"."create_customer_subscription"(text, text);

CREATE OR REPLACE FUNCTION "public"."create_customer_subscription"(
  p_vendor_id text,
  p_plan_id text,
  p_seat_id text DEFAULT NULL,
  p_start_time text DEFAULT NULL
) RETURNS TABLE (id text, start_date text, end_date text)
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
  v_seat_label text;
  v_day date;
  v_open timestamptz;
  v_close timestamptz;
  v_slot_s timestamptz;
  v_slot_e timestamptz;
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
    IF p_seat_id IS NULL THEN
      RAISE EXCEPTION 'Please choose a seat';
    END IF;

    -- Opening window of the first day sets the default start and length.
    SELECT ow.open_at, ow.close_at INTO v_first_open, v_close
    FROM admin.vendor_open_window(p_vendor_id, v_start::date) ow;
    IF v_first_open IS NULL THEN
      -- Closed today: fall back to the next open day within a week.
      FOR v_day IN SELECT (v_start::date + g)::date FROM generate_series(1, 6) g LOOP
        SELECT ow.open_at, ow.close_at INTO v_first_open, v_close
        FROM admin.vendor_open_window(p_vendor_id, v_day) ow;
        EXIT WHEN v_first_open IS NOT NULL;
      END LOOP;
    END IF;
    IF v_first_open IS NULL THEN
      RAISE EXCEPTION 'This library has no opening hours configured';
    END IF;

    IF p_start_time IS NULL THEN
      v_slot_start := (v_first_open AT TIME ZONE v_tz)::time;
    ELSE
      v_slot_start := p_start_time::time;
    END IF;
    v_slot_hours := COALESCE(v_daily_hours, ceil(extract(epoch FROM (v_close - v_first_open)) / 3600.0)::int);

    -- The daily slot must fit inside the opening window of every open weekday
    -- in the first week (covers every weekday of the schedule).
    FOR v_day IN SELECT (v_start::date + g)::date FROM generate_series(0, 6) g LOOP
      SELECT ow.open_at, ow.close_at INTO v_open, v_close
      FROM admin.vendor_open_window(p_vendor_id, v_day) ow;
      CONTINUE WHEN v_open IS NULL;

      v_slot_s := (v_day + v_slot_start) AT TIME ZONE v_tz;
      IF v_slot_s < v_open THEN v_slot_s := v_slot_s + interval '1 day'; END IF;
      v_slot_e := v_slot_s + make_interval(hours => v_slot_hours);
      IF v_slot_s < v_open OR v_slot_e > v_close THEN
        RAISE EXCEPTION 'The selected daily time slot is outside the library''s opening hours';
      END IF;
    END LOOP;

    -- Serialise writers for this seat, then check every day of the span.
    SELECT s."label" INTO v_seat_label
    FROM admin.library_seats s
    WHERE s."id" = p_seat_id AND s."vendor_id" = p_vendor_id AND s."is_active"
    FOR UPDATE;
    IF v_seat_label IS NULL THEN
      RAISE EXCEPTION 'Seat not available';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM generate_series(v_start::date::timestamp, (v_end::date - 1)::timestamp, interval '1 day') AS d
      CROSS JOIN LATERAL (
        SELECT ((d::date + v_slot_start) AT TIME ZONE v_tz) AS ws
      ) w
      JOIN LATERAL admin.seat_busy_intervals(
        p_seat_id,
        w.ws,
        w.ws + make_interval(hours => v_slot_hours)
      ) bi ON true
    ) THEN
      RAISE EXCEPTION 'This seat is not free at that time for the whole subscription. Please choose another seat or time.';
    END IF;
  END IF;

  INSERT INTO admin.subscriptions (
    "id", "user_id", "vendor_id", "plan_id", "start_date", "end_date", "status", "amount_paid",
    "customer_name", "vendor_name", "plan_name", "seat_id", "slot_start_time", "slot_hours", "updated_at"
  ) VALUES (
    v_id, auth.uid()::text, p_vendor_id, p_plan_id, v_start, v_end, 'ACTIVE', v_plan_price,
    COALESCE(v_customer_name, 'Reader'), v_vendor_name, v_plan_name,
    CASE WHEN v_has_seats THEN p_seat_id END,
    CASE WHEN v_has_seats THEN v_slot_start END,
    CASE WHEN v_has_seats THEN v_slot_hours END,
    now()
  );

  RETURN QUERY SELECT v_id, to_char(v_start, 'YYYY-MM-DD"T"HH24:MI:SS'), to_char(v_end, 'YYYY-MM-DD"T"HH24:MI:SS');
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."create_customer_subscription" TO authenticated;

-- 10. Expose seat + time on the customer's own lists --------------------------
-- New columns appended at the end (CREATE OR REPLACE VIEW requires that).
CREATE OR REPLACE VIEW "public"."customer_bookings" AS
SELECT
  b."id",
  b."booking_code",
  to_char(b."booking_date", 'YYYY-MM-DD') AS "booking_date",
  b."date_label",
  b."time_label",
  b."seat_label",
  b."amount" AS "total_amount",
  lower(b."status"::text) AS "status",
  b."created_at",
  b."vendor_name" AS "library_name",
  ls."label" AS "seat_number",
  b."duration_hours"
FROM "admin"."bookings" b
LEFT JOIN "admin"."library_seats" ls ON ls."id" = b."seat_id"
WHERE b."user_id" = auth.uid()::text;

CREATE OR REPLACE VIEW "public"."customer_subscriptions" AS
SELECT
  s."id",
  s."vendor_id",
  s."vendor_name" AS "library_name",
  s."plan_id",
  s."plan_name",
  to_char(s."start_date", 'YYYY-MM-DD') AS "start_date",
  to_char(s."end_date", 'YYYY-MM-DD') AS "end_date",
  s."amount_paid" AS "total_amount",
  CASE
    WHEN s."status" = 'ACTIVE' AND s."end_date" < now() THEN 'expired'
    ELSE lower(s."status"::text)
  END AS "status",
  s."created_at",
  ls."label" AS "seat_number",
  to_char(s."slot_start_time", 'HH24:MI') AS "slot_start",
  s."slot_hours"
FROM "admin"."subscriptions" s
LEFT JOIN "admin"."library_seats" ls ON ls."id" = s."seat_id"
WHERE s."user_id" = auth.uid()::text
ORDER BY s."created_at" DESC;

-- Plans list gains daily_hours (appended: CREATE OR REPLACE VIEW only allows
-- new columns at the end) so the customer app can size subscription slots.
CREATE OR REPLACE VIEW "public"."listing_plans" AS
SELECT
  p."id",
  p."vendor_id",
  p."name",
  p."description",
  p."price",
  p."currency",
  p."duration_value",
  p."duration_unit",
  p."daily_hours"
FROM "admin"."membership_plans" p
JOIN "admin"."vendors" v ON v."id" = p."vendor_id"
WHERE p."status" = 'ACTIVE' AND v."status" = 'PUBLISHED'
ORDER BY p."price" ASC;
