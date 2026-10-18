CREATE TABLE admin.payment_orders (
  id text PRIMARY KEY, user_id text NOT NULL, vendor_id text NOT NULL REFERENCES admin.vendors(id),
  target_type text NOT NULL CHECK (target_type IN ('visit','flex','subscription')), target_id text NOT NULL UNIQUE,
  amount_paise integer NOT NULL CHECK (amount_paise > 0), currency text NOT NULL DEFAULT 'INR',
  customer_fee_paise integer NOT NULL DEFAULT 600 CHECK(customer_fee_paise>=0), commission_paise integer CHECK(commission_paise>=0),
  status text NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','CAPTURED','CANCELLED','EXPIRED','REFUND_PENDING','REFUNDED')),
  gateway_order_id text UNIQUE, gateway_payment_id text UNIQUE, refund_id text UNIQUE,
  idempotency_key text NOT NULL, request_hash text NOT NULL, starts_at timestamptz(3) NOT NULL,
  expires_at timestamptz(3) NOT NULL, cancelled_at timestamptz(3), captured_at timestamptz(3),
  created_at timestamp(3) NOT NULL DEFAULT now(), updated_at timestamp(3) NOT NULL,
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX payment_orders_vendor_id_status_idx ON admin.payment_orders(vendor_id, status);
CREATE TABLE admin.payment_events (id text PRIMARY KEY, order_id text NOT NULL REFERENCES admin.payment_orders(id), kind text NOT NULL, created_at timestamp(3) NOT NULL DEFAULT now());
REVOKE ALL ON admin.payment_orders, admin.payment_events FROM anon, authenticated;

-- Old builds must not be able to grant themselves paid entitlements via RPC.
REVOKE ALL ON FUNCTION public.create_customer_booking(text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.create_customer_booking(text,text,text,text,text,text,text,text,text) SET SCHEMA admin;
ALTER FUNCTION admin.create_customer_booking(text,text,text,text,text,text,text,text,text) RENAME TO reserve_single_visit;
REVOKE ALL ON FUNCTION public.create_customer_subscription(text,text,text,text,integer) FROM PUBLIC, anon, authenticated;
DROP FUNCTION public.create_customer_subscription(text,text,text,text,integer);

-- Require the same launch state at the write boundary, even for direct writes.
CREATE FUNCTION admin.assert_service_available() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, admin AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NOT EXISTS (
    SELECT 1 FROM admin.vendors v JOIN admin.vendor_categories c ON c.id = v.category_id
    JOIN admin.partners p ON p.id = v.partner_id
    WHERE v.id = NEW.vendor_id AND v.status = 'PUBLISHED' AND c.launch_enabled AND c.status = 'ACTIVE' AND p.status = 'ACTIVE'
  ) THEN RAISE EXCEPTION 'This service is not available for purchase'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER booking_service_gate BEFORE INSERT ON admin.bookings FOR EACH ROW EXECUTE FUNCTION admin.assert_service_available();
CREATE TRIGGER subscription_service_gate BEFORE INSERT ON admin.subscriptions FOR EACH ROW EXECUTE FUNCTION admin.assert_service_available();
CREATE TRIGGER flex_service_gate BEFORE INSERT ON admin.flex_bookings FOR EACH ROW EXECUTE FUNCTION admin.assert_service_available();

CREATE FUNCTION admin.reserve_purchase(p_kind text, p_vendor_id text, p_plan_id text, p_date date, p_start time, p_days integer)
RETURNS TABLE (target_id text, amount_paise integer, starts_at timestamptz, seat_number text, booking_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, admin AS $$
DECLARE v admin.vendors; plan admin.membership_plans; sid text; tz text; until_day date; daily time;
  hours integer; day date; opening timestamptz; closing timestamptz; start_ts timestamptz;
  ref text := gen_random_uuid()::text; code text := 'VR-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  cost numeric; legacy record; customer text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v FROM admin.vendors WHERE id = p_vendor_id AND status = 'PUBLISHED' FOR SHARE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Listing not available'; END IF;
  SELECT * INTO plan FROM admin.membership_plans WHERE id = p_plan_id AND vendor_id = p_vendor_id AND status = 'ACTIVE' FOR SHARE;
  IF plan.id IS NULL THEN RAISE EXCEPTION 'Plan not available'; END IF;
  tz := v.time_zone;
  IF p_date IS NULL OR p_date < (now() AT TIME ZONE tz)::date THEN RAISE EXCEPTION 'Choose today or a future date'; END IF;
  IF p_kind = 'visit' THEN
    IF plan.is_flexible OR plan.duration_unit NOT IN ('HOURS','DAYS') OR (plan.duration_unit = 'DAYS' AND plan.duration_value <> 1) THEN RAISE EXCEPTION 'Choose a single-visit plan'; END IF;
    SELECT * INTO legacy FROM admin.reserve_single_visit(p_vendor_id,p_plan_id,code,p_date::text,p_date::text,'custom',p_start::text,NULL,p_start::text);
    RETURN QUERY SELECT legacy.id, (b.amount * 100)::integer, b.start_at, legacy.seat_number, code FROM admin.bookings b WHERE b.id = legacy.id;
    RETURN;
  END IF;
  IF p_kind = 'flex' THEN
    IF NOT plan.is_flexible OR p_days IS NULL OR p_days NOT BETWEEN 1 AND 14 OR p_start IS NULL THEN RAISE EXCEPTION 'Flex requires a flexible plan, time and 1-14 days'; END IF;
    daily := p_start; hours := plan.daily_hours; until_day := p_date + p_days;
    cost := plan.price * hours * p_days + 6;
  ELSIF p_kind = 'subscription' THEN
    IF plan.is_flexible OR NOT ((plan.duration_unit = 'MONTHS' AND plan.duration_value IN (1,3)) OR (plan.duration_unit = 'YEARS' AND plan.duration_value = 1)) THEN RAISE EXCEPTION 'Choose a monthly, quarterly or yearly subscription'; END IF;
    IF plan.daily_start IS NULL OR plan.daily_hours IS NULL THEN RAISE EXCEPTION 'The owner must configure this plan''s daily access window'; END IF;
    daily := plan.daily_start::time; hours := plan.daily_hours;
    until_day := (p_date + make_interval(months => CASE WHEN plan.duration_unit = 'YEARS' THEN 12 ELSE plan.duration_value END))::date;
    cost := plan.price + 6;
    UPDATE admin.subscriptions SET status='EXPIRED',updated_at=now() WHERE vendor_id=p_vendor_id AND user_id=auth.uid()::text AND status='ACTIVE' AND end_date::date <= (now() AT TIME ZONE tz)::date;
    IF EXISTS (SELECT 1 FROM admin.subscriptions s WHERE s.vendor_id = p_vendor_id AND s.user_id = auth.uid()::text AND s.status IN ('PENDING','ACTIVE')) THEN RAISE EXCEPTION 'You already have a subscription or pending checkout at this library'; END IF;
  ELSE RAISE EXCEPTION 'Unsupported purchase type'; END IF;
  -- Flex spans cover consecutive calendar days; closed days are rejected rather
  -- than silently charging for unusable days. Subscription access skips closures.
  FOR day IN SELECT generate_series(p_date, until_day - 1, interval '1 day')::date LOOP
    SELECT ow.open_at, ow.close_at INTO opening, closing FROM admin.vendor_open_window(p_vendor_id, day) ow;
    IF opening IS NULL THEN
      IF p_kind = 'flex' THEN RAISE EXCEPTION 'This Flex span includes a closed day'; ELSE CONTINUE; END IF;
    END IF;
    start_ts := (day + daily) AT TIME ZONE tz;
    IF start_ts < opening THEN start_ts := start_ts + interval '1 day'; END IF;
    IF start_ts + make_interval(hours => hours) > closing THEN RAISE EXCEPTION 'The daily window is outside opening hours'; END IF;
  END LOOP;
  start_ts := (p_date + daily) AT TIME ZONE tz;
  SELECT ow.open_at INTO opening FROM admin.vendor_open_window(p_vendor_id, p_date) ow;
  IF opening IS NULL THEN RAISE EXCEPTION 'Choose a start date when this library is open'; END IF;
  IF opening IS NOT NULL AND start_ts < opening THEN start_ts := start_ts + interval '1 day'; END IF;
  IF start_ts <= now() THEN RAISE EXCEPTION 'This access window has already started; choose a future date'; END IF;
  sid := admin.pick_seat_for_span(p_vendor_id,p_date,until_day,daily,hours,tz);
  IF sid IS NULL THEN RAISE EXCEPTION 'No seat is free for the whole selected span'; END IF;
  IF p_kind = 'flex' THEN
    INSERT INTO admin.flex_bookings(id,user_id,vendor_id,plan_id,seat_id,start_date,days,slot_start,slot_hours,amount,booking_code,updated_at)
    VALUES(ref,auth.uid()::text,p_vendor_id,p_plan_id,sid,p_date,p_days,daily,hours,cost,code,now());
  ELSE
    SELECT coalesce(full_name,'Reader') INTO customer FROM public.profiles WHERE id = auth.uid();
    INSERT INTO admin.subscriptions(id,user_id,vendor_id,plan_id,seat_id,start_date,end_date,status,amount_paid,customer_name,vendor_name,plan_name,slot_start_time,slot_hours,updated_at)
    VALUES(ref,auth.uid()::text,p_vendor_id,p_plan_id,sid,p_date,until_day,'PENDING',cost,coalesce(customer,'Reader'),v.name,plan.name,daily,hours,now());
  END IF;
  RETURN QUERY SELECT ref,(cost * 100)::integer,start_ts,s.label,CASE WHEN p_kind = 'flex' THEN code ELSE NULL::text END FROM admin.library_seats s WHERE s.id = sid;
END $$;
REVOKE ALL ON FUNCTION admin.reserve_purchase(text,text,text,date,time,integer) FROM PUBLIC, anon, authenticated;

-- Customer cancellation is handled by the payment-aware server; old RPCs would
-- otherwise bypass refund policy and ledger updates.
REVOKE ALL ON FUNCTION public.cancel_customer_booking(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_customer_subscription(text) FROM PUBLIC, anon, authenticated;

CREATE VIEW public.customer_flex_bookings AS
SELECT f.id, f.booking_code, f.start_date::text AS booking_date, f.start_date::text AS date_label,
  to_char(f.slot_start,'HH24:MI') || ' daily for ' || f.days || ' days' AS time_label,
  p.name AS seat_label, s.label AS seat_number, f.amount AS total_amount,
  CASE WHEN f.status = 'CONFIRMED' AND f.start_date + f.days <= (now() AT TIME ZONE v.time_zone)::date THEN 'completed' ELSE lower(f.status::text) END AS status,
  f.created_at, v.name AS library_name
FROM admin.flex_bookings f JOIN admin.vendors v ON v.id = f.vendor_id JOIN admin.membership_plans p ON p.id = f.plan_id
JOIN admin.library_seats s ON s.id = f.seat_id WHERE f.user_id = auth.uid()::text;
GRANT SELECT ON public.customer_flex_bookings TO authenticated;
