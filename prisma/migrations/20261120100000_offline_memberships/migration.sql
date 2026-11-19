-- Defaults preserve existing gateway orders and memberships. New purchases opt into verification.
ALTER TABLE admin.payment_orders ADD COLUMN payment_method text NOT NULL DEFAULT 'ONLINE' CHECK(payment_method IN ('ONLINE','OFFLINE')),
  ADD COLUMN verification_required boolean NOT NULL DEFAULT false,
  ADD COLUMN membership_months integer CHECK(membership_months IN(1,3,12));
CREATE TABLE admin.payment_settings (
 id text PRIMARY KEY DEFAULT 'platform' CHECK(id='platform'),
 online_enabled boolean NOT NULL DEFAULT true, offline_enabled boolean NOT NULL DEFAULT true,
 offline_hold_hours integer NOT NULL DEFAULT 24 CHECK(offline_hold_hours BETWEEN 1 AND 72),
 updated_at timestamp NOT NULL DEFAULT now(), CHECK(online_enabled OR offline_enabled)
);
INSERT INTO admin.payment_settings(id) VALUES('platform');
CREATE TABLE admin.membership_cards (
 id text PRIMARY KEY, order_id text NOT NULL UNIQUE REFERENCES admin.payment_orders(id),
 customer_name text NOT NULL, photo_path text NOT NULL, verified_by text NOT NULL REFERENCES admin.users(id),
 verified_at timestamptz(3) NOT NULL DEFAULT now(), activated_at timestamptz(3) NOT NULL DEFAULT now()
);
REVOKE ALL ON admin.payment_settings,admin.membership_cards FROM PUBLIC,anon,authenticated;

-- Live customer/partner card projection. End dates are exclusive in the reservation ledger.
CREATE VIEW admin.membership_card_details AS
SELECT c.id,c.order_id,o.user_id,o.vendor_id,o.target_id,o.payment_method,o.captured_at,
 c.photo_path,c.verified_at,c.activated_at,u.name AS verified_by,
 c.customer_name,v.name AS vendor_name,cat.slug AS category,v.time_zone,
 coalesce(s.plan_name,mp.name,'Booking') AS plan_name,
 coalesce(s.start_date::date,f.start_date,b.booking_date::date) AS valid_from,
 coalesce(s.end_date::date,f.start_date+f.days,b.booking_date::date+1)-1 AS valid_until,
 coalesce(s.slot_start_time,f.slot_start,(b.start_at AT TIME ZONE v.time_zone)::time)::time::text AS slot_start,
 coalesce(s.slot_hours,f.slot_hours,b.duration_hours::integer) AS slot_hours,
 coalesce(f.booking_code,b.booking_code,'subscription:'||s.id) AS qr_value,
 CASE WHEN o.status<>'CAPTURED' OR coalesce(s.status::text,f.status::text,b.status::text)='CANCELLED' THEN 'CANCELLED'
 WHEN (now() AT TIME ZONE v.time_zone)::date >= coalesce(s.end_date::date,f.start_date+f.days,b.booking_date::date+1) THEN 'EXPIRED'
 WHEN (now() AT TIME ZONE v.time_zone)::date < coalesce(s.start_date::date,f.start_date,b.booking_date::date) THEN 'SCHEDULED'
 ELSE 'ACTIVE' END AS status
FROM admin.membership_cards c JOIN admin.payment_orders o ON o.id=c.order_id
JOIN admin.vendors v ON v.id=o.vendor_id JOIN admin.vendor_categories cat ON cat.id=v.category_id
JOIN admin.users u ON u.id=c.verified_by
LEFT JOIN admin.subscriptions s ON s.id=o.target_id AND o.target_type='subscription'
LEFT JOIN admin.flex_bookings f ON f.id=o.target_id AND o.target_type='flex'
LEFT JOIN admin.bookings b ON b.id=o.target_id AND o.target_type='visit'
LEFT JOIN admin.membership_plans mp ON mp.id=coalesce(s.plan_id,f.plan_id,b.plan_id);
REVOKE ALL ON admin.membership_card_details FROM PUBLIC,anon,authenticated;

-- Append customer-visible payment details without changing existing columns or QR values.
CREATE OR REPLACE VIEW public.customer_payment_orders AS
SELECT id,target_id,target_type,amount_paise,status,captured_at,created_at,vendor_id,
 payment_method,expires_at,verification_required
FROM admin.payment_orders WHERE user_id=auth.uid()::text;

NOTIFY pgrst, 'reload schema';

-- Validate the current seat ledger against opening hours, including overnight slots.
CREATE FUNCTION admin.membership_windows_valid(p_target_id text,p_vendor_id text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,admin AS $$
 SELECT EXISTS(SELECT 1 FROM admin.seat_reservations r WHERE r.source_id=p_target_id AND upper(r."window")>now())
 AND NOT EXISTS(
   SELECT 1 FROM admin.seat_reservations r JOIN admin.vendors v ON v.id=p_vendor_id
   WHERE r.source_id=p_target_id AND upper(r."window")>now()
   AND NOT EXISTS(
     SELECT 1 FROM generate_series(((lower(r."window") AT TIME ZONE v.time_zone)::date-1)::timestamp,
       ((lower(r."window") AT TIME ZONE v.time_zone)::date)::timestamp,interval '1 day') AS service_day(value)
     CROSS JOIN LATERAL admin.vendor_open_window(v.id,service_day.value::date) ow
     WHERE ow.open_at<=lower(r."window") AND ow.close_at>=upper(r."window")
   )
 )
$$;
REVOKE ALL ON FUNCTION admin.membership_windows_valid(text,text) FROM PUBLIC,anon,authenticated;
