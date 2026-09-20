-- CreateEnum
CREATE TYPE "admin"."SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "admin"."subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "admin"."SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "amount_paid" DECIMAL(10,2) NOT NULL,
    "customer_name" TEXT,
    "vendor_name" TEXT,
    "plan_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "admin"."subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_vendor_id_idx" ON "admin"."subscriptions"("vendor_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "admin"."subscriptions"("status");

-- AddForeignKey
ALTER TABLE "admin"."subscriptions" ADD CONSTRAINT "subscriptions_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "admin"."membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce at most one ACTIVE subscription per (user, vendor). now() isn't
-- immutable so it can't be part of the index predicate -- the RPC below
-- lazily flips the caller's own stale ACTIVE rows (end_date < now()) to
-- EXPIRED before checking this rule, so an expired-but-not-yet-flipped row
-- never blocks a legitimate renewal.
CREATE UNIQUE INDEX "subscriptions_active_user_vendor_key"
  ON "admin"."subscriptions"("user_id", "vendor_id")
  WHERE ("status" = 'ACTIVE');

-- ---------------------------------------------------------------------------
-- Subscriptions bridge: same identity problem as bookings/reviews -- customers
-- have no admin.users row, so writes go through this SECURITY DEFINER RPC
-- rather than direct table grants (admin schema stays unexposed to PostgREST).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."create_customer_subscription"(
  p_vendor_id text,
  p_plan_id text
) RETURNS TABLE (id text, start_date text, end_date text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_vendor_name text;
  v_plan_name text;
  v_plan_price numeric;
  v_duration_value int;
  v_duration_unit text;
  v_customer_name text;
  v_id text := gen_random_uuid()::text;
  v_start timestamp := now();
  v_end timestamp;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT v."name" INTO v_vendor_name
  FROM admin.vendors v
  WHERE v."id" = p_vendor_id AND v."status" = 'PUBLISHED';

  IF v_vendor_name IS NULL THEN
    RAISE EXCEPTION 'Listing not available';
  END IF;

  SELECT p."name", p."price", p."duration_value", p."duration_unit"::text
    INTO v_plan_name, v_plan_price, v_duration_value, v_duration_unit
  FROM admin.membership_plans p
  WHERE p."id" = p_plan_id AND p."vendor_id" = p_vendor_id AND p."status" = 'ACTIVE';

  IF v_plan_name IS NULL THEN
    RAISE EXCEPTION 'Plan not available for this listing';
  END IF;

  -- A SESSIONS-unit plan is a visit-count pass, not a calendar range -- it
  -- has no meaningful start/end date, so it isn't eligible for subscription
  -- purchase (only DAYS/MONTHS/YEARS plans are).
  IF v_duration_unit = 'SESSIONS' THEN
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
  -- enforcing the one-active-per-vendor rule (see the index comment above).
  -- Table-qualified because RETURNS TABLE (id, start_date, end_date) above
  -- implicitly declares plpgsql variables of those names, which otherwise
  -- shadow the bare column references here (same bug fixed in
  -- create_customer_booking by 20260914189500_fix_..._ambiguous_id).
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

  INSERT INTO admin.subscriptions (
    "id", "user_id", "vendor_id", "plan_id", "start_date", "end_date", "status", "amount_paid",
    "customer_name", "vendor_name", "plan_name", "updated_at"
  ) VALUES (
    v_id, auth.uid()::text, p_vendor_id, p_plan_id, v_start, v_end, 'ACTIVE', v_plan_price,
    COALESCE(v_customer_name, 'Reader'), v_vendor_name, v_plan_name, now()
  );

  RETURN QUERY SELECT v_id, to_char(v_start, 'YYYY-MM-DD"T"HH24:MI:SS'), to_char(v_end, 'YYYY-MM-DD"T"HH24:MI:SS');
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."create_customer_subscription" TO authenticated;

-- Customer self-service cancellation.
CREATE OR REPLACE FUNCTION "public"."cancel_customer_subscription"(p_subscription_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE admin.subscriptions
  SET "status" = 'CANCELLED', "updated_at" = now()
  WHERE "id" = p_subscription_id AND "user_id" = auth.uid()::text AND "status" = 'ACTIVE';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."cancel_customer_subscription" TO authenticated;

-- Caller's own subscriptions (active + history). `status` reflects an
-- ACTIVE-but-past-end_date row as "expired" for display, even before the
-- next purchase attempt lazily flips the stored row -- keeps reads honest
-- without needing a cron job.
CREATE VIEW "public"."customer_subscriptions" AS
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
  s."created_at"
FROM "admin"."subscriptions" s
WHERE s."user_id" = auth.uid()::text
ORDER BY s."created_at" DESC;

GRANT SELECT ON "public"."customer_subscriptions" TO authenticated;
