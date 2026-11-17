CREATE TABLE admin.marketing_campaigns (
  id text PRIMARY KEY, title text NOT NULL, body text NOT NULL, image_url text,
  vendor_id text, service_category text, destination_url text,
  target_city text, target_area text, target_service text,
  scheduled_at timestamptz(3) NOT NULL, status text NOT NULL DEFAULT 'SCHEDULED'
    CHECK(status IN ('SCHEDULED','QUEUED','CANCELLED')),
  queued_at timestamptz(3), recipient_count integer NOT NULL DEFAULT 0,
  created_by text NOT NULL, created_at timestamptz(3) NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(vendor_id,service_category,destination_url)=1),
  CHECK (target_area IS NULL OR target_city IS NOT NULL)
);
CREATE INDEX marketing_campaigns_status_scheduled_at_idx ON admin.marketing_campaigns(status,scheduled_at);
REVOKE ALL ON admin.marketing_campaigns FROM PUBLIC,anon,authenticated;
ALTER TABLE admin.customer_notifications
  ADD COLUMN image_url text, ADD COLUMN vendor_id text,
  ADD COLUMN service_category text, ADD COLUMN destination_url text;
CREATE OR REPLACE VIEW public.customer_notifications AS
  SELECT id,title,body,read_at,created_at,image_url,vendor_id,service_category,destination_url
  FROM admin.customer_notifications WHERE user_id=auth.uid()::text;

-- The existing minute job queues inbox records; their INSERT trigger queues push delivery.
-- Campaign locks and unique event keys make concurrent workers and retries safe.
CREATE FUNCTION admin.enqueue_marketing_campaigns() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,admin AS $$
DECLARE campaign admin.marketing_campaigns; added integer; total integer := 0;
BEGIN
  FOR campaign IN SELECT * FROM admin.marketing_campaigns
    WHERE status='SCHEDULED' AND scheduled_at<=now()
    ORDER BY scheduled_at LIMIT 10 FOR UPDATE SKIP LOCKED
  LOOP
    -- Do not redirect customers to a listing that has become unavailable.
    IF campaign.vendor_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM public.published_listings WHERE id=campaign.vendor_id
    ) THEN
      UPDATE admin.marketing_campaigns SET status='CANCELLED' WHERE id=campaign.id;
      CONTINUE;
    END IF;
    INSERT INTO admin.customer_notifications(id,user_id,event_key,title,body,image_url,vendor_id,service_category,destination_url)
    SELECT gen_random_uuid()::text,p.id::text,'marketing:'||campaign.id||':'||p.id::text,
      campaign.title,campaign.body,campaign.image_url,campaign.vendor_id,campaign.service_category,campaign.destination_url
    FROM public.profiles p LEFT JOIN public.user_locations l ON l.user_id=p.id
    WHERE p.is_active AND p.role='user'
      AND (campaign.target_city IS NULL OR lower(trim(campaign.target_city))=ANY(regexp_split_to_array(lower(coalesce(l.address,'')), '\s*,\s*')))
      AND (campaign.target_area IS NULL OR lower(trim(campaign.target_area))=ANY(regexp_split_to_array(lower(coalesce(l.address,'')), '\s*,\s*')))
      AND (campaign.target_service IS NULL OR EXISTS (
        SELECT 1 FROM admin.payment_orders o
        JOIN admin.vendors v ON v.id=o.vendor_id
        JOIN admin.vendor_categories c ON c.id=v.category_id
        WHERE o.user_id=p.id::text AND o.status='CAPTURED'
          AND replace(c.slug,'-','_')=campaign.target_service
      ))
    ON CONFLICT(event_key) DO NOTHING;
    GET DIAGNOSTICS added=ROW_COUNT;
    UPDATE admin.marketing_campaigns SET status='QUEUED',queued_at=now(),recipient_count=added WHERE id=campaign.id;
    total := total+added;
  END LOOP;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION admin.enqueue_marketing_campaigns() FROM PUBLIC,anon,authenticated;
