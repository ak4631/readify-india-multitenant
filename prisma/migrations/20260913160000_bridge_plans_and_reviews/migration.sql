-- ---------------------------------------------------------------------------
-- Reviews: same identity problem bookings had -- user_id is a Supabase Auth
-- uid, which has no corresponding admin.users row. Drop the FK and
-- denormalize a display name at write time (resolved from public.profiles).
-- ---------------------------------------------------------------------------
ALTER TABLE "admin"."reviews" DROP CONSTRAINT "reviews_user_id_fkey";
ALTER TABLE "admin"."reviews" ADD COLUMN "user_name" TEXT;

-- One review per user per vendor (editable), independent of which booking
-- (if any) it references.
CREATE UNIQUE INDEX "reviews_vendor_id_user_id_key" ON "admin"."reviews"("vendor_id", "user_id");

-- Keep vendors.average_rating / review_count in sync automatically, so it
-- reflects PUBLISHED reviews regardless of whether a review was created via
-- the RPC below or moderated (hidden/deleted/restored) from the admin portal.
CREATE OR REPLACE FUNCTION "admin"."recompute_vendor_rating"() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_vendor_id text := COALESCE(NEW."vendor_id", OLD."vendor_id");
BEGIN
  UPDATE admin.vendors v
  SET "average_rating" = agg.avg_rating,
      "review_count" = agg.review_count
  FROM (
    SELECT
      ROUND(AVG(r."rating")::numeric, 1) AS avg_rating,
      COUNT(*) AS review_count
    FROM admin.reviews r
    WHERE r."vendor_id" = v_vendor_id AND r."status" = 'PUBLISHED'
  ) agg
  WHERE v."id" = v_vendor_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "reviews_recompute_vendor_rating"
AFTER INSERT OR UPDATE OR DELETE ON "admin"."reviews"
FOR EACH ROW EXECUTE FUNCTION "admin"."recompute_vendor_rating"();

-- Public read of published reviews for a listing.
CREATE VIEW "public"."listing_reviews" AS
SELECT
  r."id",
  r."vendor_id",
  r."rating",
  r."review_text",
  r."user_name",
  r."created_at"
FROM "admin"."reviews" r
WHERE r."status" = 'PUBLISHED'
ORDER BY r."created_at" DESC;

GRANT SELECT ON "public"."listing_reviews" TO anon, authenticated;

-- Customer write path: one review per (vendor, caller); resubmitting updates
-- the existing review instead of creating a duplicate.
CREATE OR REPLACE FUNCTION "public"."create_customer_review"(
  p_vendor_id text,
  p_rating int,
  p_review_text text,
  p_booking_id text DEFAULT NULL
) RETURNS "admin"."reviews"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_user_name text;
  v_result admin.reviews;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM admin.vendors WHERE "id" = p_vendor_id) THEN
    RAISE EXCEPTION 'Listing not found';
  END IF;

  IF p_booking_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM admin.bookings
    WHERE "id" = p_booking_id AND "vendor_id" = p_vendor_id AND "user_id" = auth.uid()::text
  ) THEN
    RAISE EXCEPTION 'Booking does not belong to this listing';
  END IF;

  SELECT COALESCE(NULLIF(p."full_name", ''), 'Reader') INTO v_user_name
  FROM public.profiles p
  WHERE p."id" = auth.uid();

  INSERT INTO admin.reviews ("id", "vendor_id", "user_id", "booking_id", "rating", "review_text", "user_name", "updated_at")
  VALUES (gen_random_uuid()::text, p_vendor_id, auth.uid()::text, p_booking_id, p_rating, p_review_text, COALESCE(v_user_name, 'Reader'), now())
  ON CONFLICT ("vendor_id", "user_id") DO UPDATE
    SET "rating" = EXCLUDED."rating",
        "review_text" = EXCLUDED."review_text",
        "booking_id" = COALESCE(EXCLUDED."booking_id", admin.reviews."booking_id"),
        "status" = 'PUBLISHED',
        "updated_at" = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."create_customer_review" TO authenticated;

-- ---------------------------------------------------------------------------
-- Plans: expose ACTIVE plans of PUBLISHED vendors, and make booking creation
-- derive the real price/name server-side from the chosen plan instead of
-- trusting a client-supplied amount.
-- ---------------------------------------------------------------------------
CREATE VIEW "public"."listing_plans" AS
SELECT
  p."id",
  p."vendor_id",
  p."name",
  p."description",
  p."price",
  p."currency",
  p."duration_value",
  p."duration_unit"
FROM "admin"."membership_plans" p
JOIN "admin"."vendors" v ON v."id" = p."vendor_id"
WHERE p."status" = 'ACTIVE' AND v."status" = 'PUBLISHED'
ORDER BY p."price" ASC;

GRANT SELECT ON "public"."listing_plans" TO anon, authenticated;

-- Replacing this with a new parameter list (plan-driven instead of a raw
-- amount/seat type) would otherwise leave the old signature as a stale
-- overload, since Postgres identifies functions by name + argument types.
DROP FUNCTION IF EXISTS "public"."create_customer_booking"(text, text, text, text, text, text, text, text, numeric);

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

  INSERT INTO admin.bookings (
    "id", "user_id", "vendor_id", "plan_id", "booking_date", "amount", "status",
    "booking_code", "vendor_name", "date_label", "time_slot", "time_label", "seat_type", "seat_label",
    "updated_at"
  ) VALUES (
    v_id, auth.uid()::text, p_vendor_id, p_plan_id, p_booking_date::timestamp, v_plan_price + v_platform_fee, 'PENDING',
    p_booking_code, v_vendor_name, p_date_label, p_time_slot, p_time_label, p_plan_id, v_plan_name,
    now()
  );

  RETURN QUERY SELECT v_id, p_booking_code;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."create_customer_booking" TO authenticated;
