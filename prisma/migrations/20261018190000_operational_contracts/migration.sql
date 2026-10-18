CREATE TABLE admin.partner_payouts (
  id text PRIMARY KEY,partner_id text NOT NULL REFERENCES admin.partners(id),amount_paise integer NOT NULL CHECK(amount_paise>0),
  currency text NOT NULL DEFAULT 'INR',status text NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','PAID','FAILED')),
  external_reference text UNIQUE,period_from date NOT NULL,period_to date NOT NULL CHECK(period_to>=period_from),created_at timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX partner_payouts_partner_id_status_idx ON admin.partner_payouts(partner_id,status);
REVOKE ALL ON admin.partner_payouts FROM anon,authenticated;

CREATE OR REPLACE VIEW public.customer_subscriptions AS
SELECT s.id,s.vendor_id,s.vendor_name AS library_name,s.plan_id,s.plan_name,
  to_char(s.start_date,'YYYY-MM-DD') AS start_date,to_char(s.end_date,'YYYY-MM-DD') AS end_date,s.amount_paid AS total_amount,
  CASE WHEN s.status='ACTIVE' AND s.end_date::date <= (now() AT TIME ZONE v.time_zone)::date THEN 'expired' ELSE lower(s.status::text) END AS status,
  s.created_at,ls.label AS seat_number,to_char(s.slot_start_time,'HH24:MI') AS slot_start,s.slot_hours
FROM admin.subscriptions s JOIN admin.vendors v ON v.id=s.vendor_id LEFT JOIN admin.library_seats ls ON ls.id=s.seat_id
WHERE s.user_id=auth.uid()::text ORDER BY s.created_at DESC;

CREATE OR REPLACE FUNCTION public.create_customer_review(p_vendor_id text,p_rating int,p_review_text text,p_booking_id text DEFAULT NULL)
RETURNS admin.reviews LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,admin AS $$
DECLARE result admin.reviews; customer text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_rating IS NULL OR p_rating NOT BETWEEN 1 AND 5 OR length(p_review_text)>2000 THEN RAISE EXCEPTION 'Invalid review'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.published_listings WHERE id=p_vendor_id) THEN RAISE EXCEPTION 'Listing not available'; END IF;
  IF p_booking_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM admin.bookings WHERE id=p_booking_id AND vendor_id=p_vendor_id AND user_id=auth.uid()::text) THEN RAISE EXCEPTION 'Booking not found'; END IF;
  SELECT coalesce(full_name,'Reader') INTO customer FROM public.profiles WHERE id=auth.uid();
  INSERT INTO admin.reviews(id,vendor_id,user_id,booking_id,rating,review_text,user_name,updated_at)
  VALUES(gen_random_uuid()::text,p_vendor_id,auth.uid()::text,p_booking_id,p_rating,p_review_text,coalesce(customer,'Reader'),now())
  ON CONFLICT(vendor_id,user_id) DO UPDATE SET rating=excluded.rating,review_text=excluded.review_text,owner_reply=NULL,replied_at=NULL,updated_at=now()
  RETURNING * INTO result;
  -- Deliberately preserve any Admin moderation decision on an edited review.
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.create_customer_review(text,int,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_review(text,int,text,text) TO authenticated;
