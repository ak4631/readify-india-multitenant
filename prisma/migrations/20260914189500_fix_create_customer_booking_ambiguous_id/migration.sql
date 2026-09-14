-- Fixes a bug introduced by 20260914189000_add_booking_slot_capacity:
-- `RETURNING "id"` inside the UPDATE ... booking_slots statement was
-- ambiguous, because this function's `RETURNS TABLE (id text, ...)` makes
-- "id" an implicit PL/pgSQL variable in scope, colliding with
-- admin.booking_slots.id. Table-qualifying the RETURNING column fixes it.
-- Caught by a rolled-back integration smoke test before any real booking
-- was affected.
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
