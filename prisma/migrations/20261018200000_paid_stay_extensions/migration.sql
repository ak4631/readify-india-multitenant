ALTER TABLE admin.flex_bookings ADD COLUMN parent_id text;
CREATE FUNCTION admin.reserve_extension(p_target_id text,p_plan_id text,p_hours integer)
RETURNS TABLE(target_id text,amount_paise integer,starts_at timestamptz,seat_number text,booking_code text,vendor_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,admin AS $$
DECLARE original admin.payment_orders;plan admin.membership_plans;seat text;tz text;beginning timestamptz;ending timestamptz;service_day date;
  ref text:=gen_random_uuid()::text;code text:='VR-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_hours IS NULL OR p_hours NOT BETWEEN 1 AND 24 THEN RAISE EXCEPTION 'Choose 1-24 extra hours'; END IF;
  SELECT o.* INTO original FROM admin.payment_orders o WHERE o.target_id=p_target_id AND o.user_id=auth.uid()::text AND o.status='CAPTURED' FOR UPDATE;
  IF original.id IS NULL THEN RAISE EXCEPTION 'A paid current reservation is required'; END IF;
  SELECT p.* INTO plan FROM admin.membership_plans p WHERE p.id=p_plan_id AND p.vendor_id=original.vendor_id AND p.is_flexible AND p.status='ACTIVE' FOR SHARE;
  IF plan.id IS NULL THEN RAISE EXCEPTION 'Choose an active hourly Flex rate'; END IF;
  SELECT r.seat_id,upper(r."window"),v.time_zone INTO seat,beginning,tz
  FROM admin.seat_reservations r JOIN admin.library_seats s ON s.id=r.seat_id JOIN admin.vendors v ON v.id=s.vendor_id
  JOIN public.published_listings pub ON pub.id=v.id
  WHERE r.source_id=p_target_id AND r."window" @> now() LIMIT 1;
  IF seat IS NULL THEN RAISE EXCEPTION 'Only a currently running stay can be extended'; END IF;
  PERFORM 1 FROM admin.library_seats WHERE id=seat AND is_active FOR UPDATE;
  ending:=beginning+make_interval(hours=>p_hours);
  SELECT d::date INTO service_day FROM generate_series(((beginning AT TIME ZONE tz)::date-1)::timestamp,((beginning AT TIME ZONE tz)::date)::timestamp,interval '1 day') d
  CROSS JOIN LATERAL admin.vendor_open_window(original.vendor_id,d::date) ow
  WHERE ow.open_at<=beginning AND ow.close_at>=ending LIMIT 1;
  IF service_day IS NULL THEN RAISE EXCEPTION 'The extra hours extend beyond opening hours'; END IF;
  IF EXISTS(SELECT 1 FROM admin.seat_reservations r WHERE r.seat_id=seat AND r."window" && tstzrange(beginning,ending,'[)')) THEN RAISE EXCEPTION 'This seat is reserved after your current window'; END IF;
  INSERT INTO admin.flex_bookings(id,user_id,vendor_id,plan_id,parent_id,seat_id,start_date,days,slot_start,slot_hours,amount,booking_code,updated_at)
  VALUES(ref,auth.uid()::text,original.vendor_id,p_plan_id,p_target_id,seat,service_day,1,(beginning AT TIME ZONE tz)::time,p_hours,plan.price*p_hours+6,code,now());
  RETURN QUERY SELECT ref,((plan.price*p_hours+6)*100)::integer,beginning,s.label,code,original.vendor_id FROM admin.library_seats s WHERE s.id=seat;
END $$;
REVOKE ALL ON FUNCTION admin.reserve_extension(text,text,integer) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE VIEW public.customer_payment_orders AS
SELECT id,target_id,target_type,amount_paise,status,captured_at,created_at,vendor_id FROM admin.payment_orders WHERE user_id=auth.uid()::text;
