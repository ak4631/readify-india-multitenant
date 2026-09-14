-- ---------------------------------------------------------------------------
-- create_customer_booking: now lazily provisions the admin.booking_slots row
-- for (vendor, date, bucket) on first booking, and atomically decrements
-- available_capacity. The UPDATE ... WHERE available_capacity > 0 RETURNING
-- pattern is race-condition-safe under Postgres MVCC (row lock acquired by
-- UPDATE serializes concurrent callers) without needing an explicit
-- SELECT ... FOR UPDATE / advisory lock.
--
-- Time buckets mirror reactnative-readify/screens/BookingScreen.tsx's
-- `timeSlots` const -- keep both in sync if hours ever change. Also
-- duplicated in get_slot_availability below.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."create_customer_booking"(
  p_vendor_id text,
  p_plan_id text,
  p_booking_code text,
  p_booking_date text,
  p_date_label text,
  p_time_slot text,
  p_time_label text
) RETURNS TABLE (id text, booking_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_vendor_name text;
  v_plan_name text;
  v_plan_price numeric;
  v_id text := gen_random_uuid()::text;
  v_platform_fee CONSTANT numeric := 6;
  -- Fallback when the vendor has no admin.library_seat_types rows (only
  -- populated today for LIBRARY-category vendors). Not admin-configurable
  -- yet.
  v_default_capacity CONSTANT int := 20;
  v_slot_date date;
  v_start_time time;
  v_end_time time;
  v_capacity int;
  v_locked_slot_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT v."name" INTO v_vendor_name
  FROM admin.vendors v
  WHERE v."id" = p_vendor_id AND v."status" = 'PUBLISHED';

  IF v_vendor_name IS NULL THEN
    RAISE EXCEPTION 'Listing not available for booking';
  END IF;

  SELECT p."name", p."price" INTO v_plan_name, v_plan_price
  FROM admin.membership_plans p
  WHERE p."id" = p_plan_id AND p."vendor_id" = p_vendor_id AND p."status" = 'ACTIVE';

  IF v_plan_name IS NULL THEN
    RAISE EXCEPTION 'Plan not available for this listing';
  END IF;

  v_slot_date := p_booking_date::date;

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

  -- Lazy provision: ON CONFLICT DO NOTHING makes concurrent first-time
  -- bookings of the same slot safe (the unique index does the locking).
  INSERT INTO admin.booking_slots
    ("id", "vendor_id", "slot_date", "start_time", "end_time", "capacity", "available_capacity", "status")
  VALUES
    (gen_random_uuid()::text, p_vendor_id, v_slot_date, v_start_time, v_end_time, v_capacity, v_capacity, 'ACTIVE')
  ON CONFLICT ("vendor_id", "slot_date", "start_time", "end_time") DO NOTHING;

  UPDATE admin.booking_slots
  SET "available_capacity" = "available_capacity" - 1
  WHERE "vendor_id" = p_vendor_id
    AND "slot_date" = v_slot_date
    AND "start_time" = v_start_time
    AND "end_time" = v_end_time
    AND "available_capacity" > 0
    AND "status" = 'ACTIVE'
  RETURNING "id" INTO v_locked_slot_id;

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

-- ---------------------------------------------------------------------------
-- cancel_customer_booking: releases the slot's capacity back on cancel.
-- Guarded against double-release (status NOT IN CANCELLED/COMPLETED) and
-- against over-incrementing past the slot's original capacity (LEAST).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."cancel_customer_booking"(p_booking_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_slot_id text;
BEGIN
  UPDATE admin.bookings
  SET "status" = 'CANCELLED', "updated_at" = now()
  WHERE "id" = p_booking_id
    AND "user_id" = auth.uid()::text
    AND "status" NOT IN ('CANCELLED', 'COMPLETED')
  RETURNING "slot_id" INTO v_slot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_slot_id IS NOT NULL THEN
    UPDATE admin.booking_slots
    SET "available_capacity" = LEAST("available_capacity" + 1, "capacity")
    WHERE "id" = v_slot_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."cancel_customer_booking" TO authenticated;

-- ---------------------------------------------------------------------------
-- get_slot_availability: read-only helper for the RN booking picker so it
-- can show "N left" / disable full slots before the user submits, instead
-- of only finding out at payment time. Does NOT provision rows (that stays
-- lazy, only on actual booking) -- for un-provisioned slots it reports the
-- same default-capacity computation create_customer_booking would use, so
-- the UI and the write path never disagree.
-- ---------------------------------------------------------------------------
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
  v_capacity int;
BEGIN
  SELECT COALESCE(SUM(lst."total_count"), v_default_capacity) INTO v_capacity
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
