CREATE FUNCTION admin.reserve_purchase(p_kind text, p_vendor_id text, p_plan_id text, p_date date, p_start time, p_days integer, p_hours integer)
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
    daily := p_start; hours := coalesce(p_hours, plan.daily_hours); until_day := p_date + p_days;
    IF hours IS NULL OR (p_hours IS NOT NULL AND hours NOT IN (4,6,8,12,16,18,24)) THEN RAISE EXCEPTION 'Choose 4, 6, 8, 12, 16, 18 or 24 daily hours'; END IF;
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
REVOKE ALL ON FUNCTION admin.reserve_purchase(text,text,text,date,time,integer,integer) FROM PUBLIC, anon, authenticated;


CREATE FUNCTION public.get_purchase_options(p_vendor_id text,p_plan_id text,p_date date,p_days integer, p_hours integer)
RETURNS TABLE(total_seats integer,start_time text,end_time text,seats_available integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,admin AS $$
DECLARE plan admin.membership_plans; tz text; until_day date; slot time; opening timestamptz; closing timestamptz;
  first_open timestamptz; first_close timestamptz; beginning timestamptz; candidate_start timestamptz; candidate_end timestamptz; day date; fits boolean; total integer; n integer;
BEGIN
  SELECT v.time_zone INTO tz FROM admin.vendors v JOIN public.published_listings pub ON pub.id=v.id WHERE v.id=p_vendor_id;
  IF tz IS NULL OR p_date IS NULL OR p_date < (now() AT TIME ZONE tz)::date THEN RETURN; END IF;
  SELECT * INTO plan FROM admin.membership_plans WHERE id=p_plan_id AND vendor_id=p_vendor_id AND status='ACTIVE';
  IF plan.id IS NULL THEN RETURN; END IF;
  IF plan.is_flexible AND p_hours IS NOT NULL THEN
    IF p_hours NOT IN (4,6,8,12,16,18,24) THEN RETURN; END IF;
    plan.daily_hours := p_hours;
  END IF;
  IF plan.daily_hours IS NULL THEN RETURN; END IF;
  SELECT count(*)::integer INTO total FROM admin.library_seats WHERE vendor_id=p_vendor_id AND is_active;
  IF total=0 THEN RETURN; END IF;
  IF plan.is_flexible THEN
    IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 14 THEN RETURN; END IF;
    until_day:=p_date+p_days;
  ELSE
    IF plan.daily_start IS NULL OR NOT ((plan.duration_unit='MONTHS' AND plan.duration_value IN(1,3)) OR (plan.duration_unit='YEARS' AND plan.duration_value=1)) THEN RETURN; END IF;
    until_day:=(p_date+make_interval(months=>CASE WHEN plan.duration_unit='YEARS' THEN 12 ELSE plan.duration_value END))::date;
  END IF;
  SELECT ow.open_at,ow.close_at INTO first_open,first_close FROM admin.vendor_open_window(p_vendor_id,p_date) ow;
  IF first_open IS NULL THEN
    RETURN QUERY SELECT total,NULL::text,NULL::text,0; RETURN;
  END IF;
  IF plan.is_flexible THEN candidate_start:=first_open; candidate_end:=first_close-make_interval(hours=>plan.daily_hours);
  ELSE
    candidate_start:=(p_date+plan.daily_start::time) AT TIME ZONE tz;
    IF candidate_start<first_open THEN candidate_start:=candidate_start+interval '1 day'; END IF;
    candidate_end:=candidate_start;
  END IF;
  FOR beginning IN SELECT generate_series(candidate_start,candidate_end,interval '30 minutes') LOOP
    slot:=(beginning AT TIME ZONE tz)::time;
    CONTINUE WHEN beginning<=now();
    CONTINUE WHEN NOT plan.is_flexible AND slot<>plan.daily_start::time;
    fits:=true;
    FOR day IN SELECT generate_series(p_date,until_day-1,interval '1 day')::date LOOP
      SELECT ow.open_at,ow.close_at INTO opening,closing FROM admin.vendor_open_window(p_vendor_id,day) ow;
      IF opening IS NULL THEN IF plan.is_flexible THEN fits:=false; EXIT; ELSE CONTINUE; END IF; END IF;
      IF (CASE WHEN (day+slot) AT TIME ZONE tz < opening THEN ((day+slot) AT TIME ZONE tz)+interval '1 day' ELSE (day+slot) AT TIME ZONE tz END) + make_interval(hours=>plan.daily_hours)>closing THEN fits:=false; EXIT; END IF;
    END LOOP;
    CONTINUE WHEN NOT fits;
    SELECT count(*)::integer INTO n FROM admin.library_seats s WHERE vendor_id=p_vendor_id AND is_active AND admin.seat_free_for_span(s.id,p_date,until_day,slot,plan.daily_hours,tz);
    RETURN QUERY SELECT total,to_char(slot,'HH24:MI'),to_char(slot+make_interval(hours=>plan.daily_hours),'HH24:MI'),n;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.get_purchase_options(text,text,date,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_purchase_options(text,text,date,integer,integer) TO authenticated;

-- Customer-owned favourites; policies bind every read/write to auth.uid().
CREATE TABLE public.customer_wishlist (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vendor_id text NOT NULL REFERENCES admin.vendors(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,vendor_id)
);
ALTER TABLE public.customer_wishlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY wishlist_owner ON public.customer_wishlist FOR ALL TO authenticated
  USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
GRANT SELECT,INSERT,DELETE ON public.customer_wishlist TO authenticated;

CREATE TABLE admin.customer_support_tickets (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id uuid NOT NULL REFERENCES public.profiles(id),
  subject text NOT NULL CHECK(length(subject) BETWEEN 3 AND 150), message text NOT NULL CHECK(length(message) BETWEEN 10 AND 5000),
  status text NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','RESOLVED')), response text,
  responded_by text REFERENCES admin.users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_support_user_idx ON admin.customer_support_tickets(user_id,created_at);
REVOKE ALL ON admin.customer_support_tickets FROM PUBLIC,anon,authenticated;
CREATE VIEW public.customer_support_tickets AS SELECT id,subject,message,status,response,created_at FROM admin.customer_support_tickets WHERE user_id=auth.uid();
GRANT SELECT ON public.customer_support_tickets TO authenticated;
CREATE FUNCTION public.create_customer_support_ticket(p_subject text,p_message text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,admin AS $$
DECLARE result text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND is_active) THEN RAISE EXCEPTION 'Sign in to contact support'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
  IF (SELECT count(*) FROM admin.customer_support_tickets WHERE user_id=auth.uid() AND created_at>now()-interval '1 hour')>=5 THEN RAISE EXCEPTION 'Please wait before creating another ticket'; END IF;
  INSERT INTO admin.customer_support_tickets(user_id,subject,message) VALUES(auth.uid(),trim(p_subject),trim(p_message)) RETURNING id INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_customer_support_ticket(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_support_ticket(text,text) TO authenticated;

CREATE TABLE admin.promotional_banners (
  id text PRIMARY KEY, title text NOT NULL, image_url text NOT NULL CHECK(image_url LIKE 'https://%'), external_id text NOT NULL,
  vendor_id text REFERENCES admin.vendors(id), destination_url text CHECK(destination_url LIKE 'https://%'),
  target_city text, target_area text, latitude double precision, longitude double precision, radius_km double precision,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, is_active boolean NOT NULL DEFAULT true, sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(ends_at>starts_at), CHECK((vendor_id IS NOT NULL)::int+(destination_url IS NOT NULL)::int=1),
  CHECK(target_area IS NULL OR target_city IS NOT NULL),
  CHECK((latitude IS NULL AND longitude IS NULL AND radius_km IS NULL) OR
        (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 AND radius_km>0 AND latitude IS NOT NULL AND longitude IS NOT NULL AND radius_km IS NOT NULL))
);
CREATE INDEX promotional_banners_active_idx ON admin.promotional_banners(is_active,starts_at,ends_at);
REVOKE ALL ON admin.promotional_banners FROM PUBLIC,anon,authenticated;
-- Location table is also used by the mobile app; bootstrap it on admin-only installs.
CREATE TABLE IF NOT EXISTS "public"."user_locations" (
  "user_id"           UUID NOT NULL,
  "latitude"          DECIMAL(9,6) NOT NULL,
  "longitude"         DECIMAL(9,6) NOT NULL,
  "address"           TEXT,
  "source"            TEXT NOT NULL DEFAULT 'gps',
  "permission_status" TEXT NOT NULL DEFAULT 'granted',
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "user_locations_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "user_locations_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "user_locations_source_check"
    CHECK ("source" IN ('gps', 'manual')),
  CONSTRAINT "user_locations_permission_status_check"
    CHECK ("permission_status" IN ('granted', 'denied', 'undetermined'))
);

ALTER TABLE "public"."user_locations" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_locations' AND policyname='user_locations_select_own') THEN CREATE POLICY "user_locations_select_own" ON "public"."user_locations"
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_locations' AND policyname='user_locations_upsert_own') THEN CREATE POLICY "user_locations_upsert_own" ON "public"."user_locations"
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id); END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_locations' AND policyname='user_locations_update_own') THEN CREATE POLICY "user_locations_update_own" ON "public"."user_locations"
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id); END IF; END $$;

GRANT SELECT, INSERT, UPDATE ON "public"."user_locations" TO authenticated;

CREATE FUNCTION public.get_promotional_banners(p_use_saved_location boolean DEFAULT true)
RETURNS TABLE(id text,title text,image_url text,vendor_id text,destination_url text,category text,vendor_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,admin AS $$
  SELECT b.id,b.title,b.image_url,b.vendor_id,b.destination_url,p.category,p.name
  FROM admin.promotional_banners b
  LEFT JOIN public.published_listings p ON p.id=b.vendor_id
  LEFT JOIN public.user_locations l ON l.user_id=auth.uid() AND p_use_saved_location
  WHERE auth.uid() IS NOT NULL AND b.is_active AND now()>=b.starts_at AND now()<b.ends_at
    AND (b.vendor_id IS NULL OR p.id IS NOT NULL)
    AND (b.target_city IS NULL OR lower(trim(b.target_city))=ANY(regexp_split_to_array(lower(coalesce(l.address,'')), '\s*,\s*')))
    AND (b.target_area IS NULL OR lower(trim(b.target_area))=ANY(regexp_split_to_array(lower(coalesce(l.address,'')), '\s*,\s*')))
    AND (b.radius_km IS NULL OR (l.latitude IS NOT NULL AND
      6371*2*asin(sqrt(least(1.0,power(sin(radians(l.latitude-b.latitude)/2),2)+cos(radians(b.latitude))*cos(radians(l.latitude))*power(sin(radians(l.longitude-b.longitude)/2),2))))<=b.radius_km))
  ORDER BY b.sort_order,b.created_at DESC LIMIT 4
$$;
REVOKE ALL ON FUNCTION public.get_promotional_banners(boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_promotional_banners(boolean) TO authenticated;

-- Called by the existing authenticated jobs endpoint, once per minute.
-- Reservation windows already reflect local timezone, overnight access and seat allocation.
CREATE FUNCTION admin.enqueue_booking_reminders(p_now timestamptz DEFAULT now()) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,admin AS $$
DECLARE added integer;
BEGIN
  INSERT INTO admin.customer_notifications(id,user_id,event_key,title,body)
  SELECT gen_random_uuid()::text,o.user_id,'booking-reminder:'||o.target_id||':'||extract(epoch FROM lower(r.window))::text,
    'Your booking starts in one hour',v.name||' · '||to_char(lower(r.window) AT TIME ZONE v.time_zone,'DD Mon HH24:MI')||' ('||v.time_zone||') · Seat '||s.label
  FROM admin.seat_reservations r JOIN admin.payment_orders o ON o.target_id=r.source_id AND o.status='CAPTURED'
  JOIN admin.vendors v ON v.id=o.vendor_id JOIN admin.library_seats s ON s.id=r.seat_id
  WHERE lower(r.window)>p_now AND lower(r.window)<=p_now+interval '1 hour'
  ON CONFLICT(event_key) DO NOTHING;
  GET DIAGNOSTICS added=ROW_COUNT; RETURN added;
END $$;
REVOKE ALL ON FUNCTION admin.enqueue_booking_reminders(timestamptz) FROM PUBLIC,anon,authenticated;
