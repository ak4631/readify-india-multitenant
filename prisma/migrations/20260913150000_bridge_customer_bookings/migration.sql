-- Customer bookings from the RN app use Supabase Auth identities, which have
-- no corresponding admin.users row (that table is staff/partner-only: every
-- row requires a password_hash and a portal role). Drop the FK so admin.bookings
-- can hold a real customer's Supabase auth uid in user_id.
ALTER TABLE "admin"."bookings" DROP CONSTRAINT "bookings_user_id_fkey";

-- Display metadata the customer app already collects (time slot / seat type
-- selection, a human-readable code) that the admin booking model didn't have
-- yet. Denormalized here so admin.bookings stays the single source of truth
-- instead of splitting bookings across two tables again.
ALTER TABLE "admin"."bookings"
  ADD COLUMN "booking_code" TEXT,
  ADD COLUMN "vendor_name" TEXT,
  ADD COLUMN "date_label" TEXT,
  ADD COLUMN "time_slot" TEXT,
  ADD COLUMN "time_label" TEXT,
  ADD COLUMN "seat_type" TEXT,
  ADD COLUMN "seat_label" TEXT;

CREATE UNIQUE INDEX "bookings_booking_code_key" ON "admin"."bookings"("booking_code");

-- Bridge for the customer app: the admin schema stays unexposed to PostgREST
-- (same reasoning as public.published_listings), so writes/reads go through
-- these SECURITY DEFINER RPCs + a view instead of granting direct table access.
CREATE OR REPLACE FUNCTION "public"."create_customer_booking"(
  p_vendor_id text,
  p_booking_code text,
  p_booking_date text,
  p_date_label text,
  p_time_slot text,
  p_time_label text,
  p_seat_type text,
  p_seat_label text,
  p_amount numeric
) RETURNS TABLE (id text, booking_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_vendor_name text;
  v_id text := gen_random_uuid()::text;
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

  INSERT INTO admin.bookings (
    "id", "user_id", "vendor_id", "booking_date", "amount", "status",
    "booking_code", "vendor_name", "date_label", "time_slot", "time_label", "seat_type", "seat_label",
    "updated_at"
  ) VALUES (
    v_id, auth.uid()::text, p_vendor_id, p_booking_date::timestamp, p_amount, 'PENDING',
    p_booking_code, v_vendor_name, p_date_label, p_time_slot, p_time_label, p_seat_type, p_seat_label,
    now()
  );

  RETURN QUERY SELECT v_id, p_booking_code;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."create_customer_booking" TO authenticated;

CREATE OR REPLACE FUNCTION "public"."cancel_customer_booking"(p_booking_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
  UPDATE admin.bookings
  SET "status" = 'CANCELLED', "updated_at" = now()
  WHERE "id" = p_booking_id AND "user_id" = auth.uid()::text;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."cancel_customer_booking" TO authenticated;

CREATE VIEW "public"."customer_bookings" AS
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
  b."vendor_name" AS "library_name"
FROM "admin"."bookings" b
WHERE b."user_id" = auth.uid()::text;

GRANT SELECT ON "public"."customer_bookings" TO authenticated;
