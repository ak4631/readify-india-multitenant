CREATE OR REPLACE VIEW public.listing_plans AS
SELECT p.id,p.vendor_id,p.name,p.description,p.price,p.currency,p.duration_value,p.duration_unit,p.daily_hours,p.is_flexible,p.daily_start
FROM admin.membership_plans p JOIN public.published_listings v ON v.id=p.vendor_id
WHERE p.status='ACTIVE' ORDER BY p.price ASC;

CREATE FUNCTION public.get_purchase_options(p_vendor_id text,p_plan_id text,p_date date,p_days integer DEFAULT NULL)
RETURNS TABLE(total_seats integer,start_time text,end_time text,seats_available integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,admin AS $$
DECLARE plan admin.membership_plans; tz text; until_day date; slot time; opening timestamptz; closing timestamptz;
  first_open timestamptz; first_close timestamptz; beginning timestamptz; candidate_start timestamptz; candidate_end timestamptz; day date; fits boolean; total integer; n integer;
BEGIN
  SELECT v.time_zone INTO tz FROM admin.vendors v JOIN public.published_listings pub ON pub.id=v.id WHERE v.id=p_vendor_id;
  IF tz IS NULL OR p_date IS NULL OR p_date < (now() AT TIME ZONE tz)::date THEN RETURN; END IF;
  SELECT * INTO plan FROM admin.membership_plans WHERE id=p_plan_id AND vendor_id=p_vendor_id AND status='ACTIVE';
  IF plan.id IS NULL OR plan.daily_hours IS NULL THEN RETURN; END IF;
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
REVOKE ALL ON FUNCTION public.get_purchase_options(text,text,date,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_purchase_options(text,text,date,integer) TO authenticated;
