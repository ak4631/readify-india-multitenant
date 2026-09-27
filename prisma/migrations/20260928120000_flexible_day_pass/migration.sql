-- ---------------------------------------------------------------------------
-- Flexible day-pass plans: a partner opts a plan into "flexible" mode, in
-- which `price` is reinterpreted as a per-hour rate and the customer picks
-- 1-14 days at purchase time (a stepper in the app) instead of the plan
-- having a fixed duration. Applies to every category (library, gym,
-- co-working-space, exam-hub) since they all share admin.membership_plans --
-- only library additionally holds a seat for the chosen span.
--
-- To make the total instantly computable client-side as the stepper moves
-- (no round trip per tap), a flexible plan's daily_hours is REQUIRED --
-- price * daily_hours * days -- rather than falling back to the vendor's
-- opening window like ordinary multi-day plans do.
--
-- A flexible pass is modelled as an ordinary admin.subscriptions row (same
-- one-active-per-vendor rule, same seat auto-assignment for library, same
-- unlimited/no-capacity-check behaviour for non-seat categories that ordinary
-- ANY-length subscriptions already have today) -- just with a customer-chosen
-- span and a computed amount instead of a plan-fixed one. No new tables, no
-- new booking/subscription status, no change to create_customer_booking
-- (flexible plans are never single-visit bookings, even at 1 day -- always
-- through create_customer_subscription, for one consistent code path).
-- ---------------------------------------------------------------------------

ALTER TABLE "admin"."membership_plans" ADD COLUMN "is_flexible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "admin"."membership_plans" ADD CONSTRAINT "membership_plans_flexible_shape"
  CHECK (NOT "is_flexible" OR ("duration_unit" = 'HOURS' AND "daily_hours" IS NOT NULL));

-- Expose it to the customer app (public.listing_plans is what reactnative-
-- readify's lib/plans.ts selects from) -- appended at the end, the only
-- position CREATE OR REPLACE VIEW allows without dropping it first.
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
  p."daily_hours",
  p."is_flexible"
FROM "admin"."membership_plans" p
JOIN "admin"."vendors" v ON v."id" = p."vendor_id"
WHERE p."status" = 'ACTIVE' AND v."status" = 'PUBLISHED'
ORDER BY p."price" ASC;

-- ---------------------------------------------------------------------------
-- get_library_subscription_options: p_days is only meaningful for a flexible
-- plan (sizes the availability window to what the customer currently has
-- selected -- a seat free for 3 days may not be free for 10); ordinary plans
-- ignore it and keep computing their fixed span exactly as before.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS "public"."get_library_subscription_options"(text, text);

CREATE OR REPLACE FUNCTION "public"."get_library_subscription_options"(
  p_vendor_id text,
  p_plan_id text,
  p_days integer DEFAULT NULL
)
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
  v_is_flexible boolean;
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

  SELECT p."duration_unit"::text, p."duration_value", p."daily_hours", p."is_flexible"
    INTO v_unit, v_value, v_daily, v_is_flexible
  FROM admin.membership_plans p
  WHERE p."id" = p_plan_id AND p."vendor_id" = p_vendor_id AND p."status" = 'ACTIVE';
  IF v_unit IS NULL THEN RETURN; END IF;
  IF NOT v_is_flexible AND v_unit NOT IN ('DAYS', 'MONTHS', 'YEARS') THEN RETURN; END IF;

  IF v_is_flexible THEN
    IF p_days IS NULL OR p_days < 1 OR p_days > 14 THEN RETURN; END IF;
    v_to := v_from + p_days;
  ELSE
    v_to := (now()::timestamp + CASE v_unit
      WHEN 'DAYS'   THEN make_interval(days => v_value)
      WHEN 'MONTHS' THEN make_interval(months => v_value)
      ELSE make_interval(years => v_value)
    END)::date;
  END IF;

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

-- ---------------------------------------------------------------------------
-- create_customer_subscription: p_days is required (and validated 1-14) for a
-- flexible plan, ignored for ordinary plans. The amount charged for a
-- flexible plan is price(=rate/hour) * hours/day * days instead of the flat
-- plan price.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS "public"."create_customer_subscription"(text, text, text, text);

CREATE OR REPLACE FUNCTION "public"."create_customer_subscription"(
  p_vendor_id text,
  p_plan_id text,
  p_seat_id text DEFAULT NULL,
  p_start_time text DEFAULT NULL,
  p_days integer DEFAULT NULL
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
  v_is_flexible boolean;
  v_customer_name text;
  v_id text := gen_random_uuid()::text;
  v_start timestamp := now();
  v_end timestamp;
  v_amount numeric;
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

  SELECT p."name", p."price", p."duration_value", p."duration_unit"::text, p."daily_hours", p."is_flexible"
    INTO v_plan_name, v_plan_price, v_duration_value, v_duration_unit, v_daily_hours, v_is_flexible
  FROM admin.membership_plans p
  WHERE p."id" = p_plan_id AND p."vendor_id" = p_vendor_id AND p."status" = 'ACTIVE';

  IF v_plan_name IS NULL THEN
    RAISE EXCEPTION 'Plan not available for this listing';
  END IF;

  -- SESSIONS / HOURS plans are visit passes, not calendar ranges -- except a
  -- flexible plan, which is HOURS-unit (the rate's unit) but IS a calendar
  -- range, just with a customer-chosen length instead of a plan-fixed one.
  IF NOT v_is_flexible AND v_duration_unit NOT IN ('DAYS', 'MONTHS', 'YEARS') THEN
    RAISE EXCEPTION 'This plan is not available as a subscription';
  END IF;

  IF v_is_flexible THEN
    IF p_days IS NULL OR p_days < 1 OR p_days > 14 THEN
      RAISE EXCEPTION 'Choose between 1 and 14 days';
    END IF;
    v_end := v_start + (p_days || ' days')::interval;
  ELSE
    v_end := CASE v_duration_unit
      WHEN 'DAYS'   THEN v_start + (v_duration_value || ' days')::interval
      WHEN 'MONTHS' THEN v_start + (v_duration_value || ' months')::interval
      WHEN 'YEARS'  THEN v_start + (v_duration_value || ' years')::interval
    END;
  END IF;

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

  -- A flexible plan's stored price is a per-hour rate; a non-seat vendor
  -- never populates v_slot_hours above, so a flexible plan needs it here too
  -- (daily_hours is required by the flexible-plan CHECK constraint, so this
  -- is never null when v_is_flexible).
  IF v_is_flexible AND v_slot_hours IS NULL THEN
    v_slot_hours := v_daily_hours;
  END IF;

  v_amount := CASE WHEN v_is_flexible THEN v_plan_price * v_slot_hours * p_days ELSE v_plan_price END;

  INSERT INTO admin.subscriptions (
    "id", "user_id", "vendor_id", "plan_id", "start_date", "end_date", "status", "amount_paid",
    "customer_name", "vendor_name", "plan_name", "seat_id", "slot_start_time", "slot_hours", "updated_at"
  ) VALUES (
    v_id, auth.uid()::text, p_vendor_id, p_plan_id, v_start, v_end, 'ACTIVE', v_amount,
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
