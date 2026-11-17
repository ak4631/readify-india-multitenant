-- A broadcast can open the notification inbox without a listing or external link.
ALTER TABLE admin.marketing_campaigns DROP CONSTRAINT marketing_campaigns_check;
ALTER TABLE admin.marketing_campaigns ADD CONSTRAINT marketing_campaigns_destination_check
  CHECK (num_nonnulls(vendor_id,service_category,destination_url)<=1);

-- Shared by recipient preview and delivery so their eligibility rules cannot diverge.
CREATE FUNCTION admin.marketing_audience(p_city text DEFAULT NULL,p_area text DEFAULT NULL,p_service text DEFAULT NULL)
RETURNS TABLE(user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,admin AS $$
  SELECT p.id FROM public.profiles p LEFT JOIN public.user_locations l ON l.user_id=p.id
  WHERE p.is_active
    AND (nullif(trim(p_city),'') IS NULL OR lower(trim(p_city))=ANY(regexp_split_to_array(lower(coalesce(l.address,'')), '\s*,\s*')))
    AND (nullif(trim(p_area),'') IS NULL OR lower(trim(p_area))=ANY(regexp_split_to_array(lower(coalesce(l.address,'')), '\s*,\s*')))
    AND (nullif(trim(p_service),'') IS NULL OR EXISTS (
      SELECT 1 FROM admin.payment_orders o
      JOIN admin.vendors v ON v.id=o.vendor_id
      JOIN admin.vendor_categories c ON c.id=v.category_id
      WHERE o.user_id=p.id::text AND o.status='CAPTURED' AND replace(c.slug,'-','_')=p_service
    ))
$$;
REVOKE ALL ON FUNCTION admin.marketing_audience(text,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION admin.enqueue_marketing_campaign(p_id text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,admin AS $$
DECLARE campaign admin.marketing_campaigns; added integer;
BEGIN
  SELECT * INTO campaign FROM admin.marketing_campaigns WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR campaign.status<>'SCHEDULED' OR campaign.scheduled_at>now() THEN RETURN 0; END IF;
  IF campaign.vendor_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.published_listings WHERE id=campaign.vendor_id) THEN
    UPDATE admin.marketing_campaigns SET status='CANCELLED' WHERE id=p_id;
    RETURN 0;
  END IF;
  INSERT INTO admin.customer_notifications(id,user_id,event_key,title,body,image_url,vendor_id,service_category,destination_url)
  SELECT gen_random_uuid()::text,a.user_id::text,'marketing:'||campaign.id||':'||a.user_id::text,
    campaign.title,campaign.body,campaign.image_url,campaign.vendor_id,campaign.service_category,campaign.destination_url
  FROM admin.marketing_audience(campaign.target_city,campaign.target_area,campaign.target_service) a
  ON CONFLICT(event_key) DO NOTHING;
  GET DIAGNOSTICS added=ROW_COUNT;
  UPDATE admin.marketing_campaigns SET status='QUEUED',queued_at=now(),recipient_count=added WHERE id=p_id;
  RETURN added;
END $$;
REVOKE ALL ON FUNCTION admin.enqueue_marketing_campaign(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION admin.enqueue_marketing_campaigns() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,admin AS $$
DECLARE campaign_id text; total integer := 0;
BEGIN
  FOR campaign_id IN SELECT id FROM admin.marketing_campaigns
    WHERE status='SCHEDULED' AND scheduled_at<=now()
    ORDER BY scheduled_at LIMIT 10 FOR UPDATE SKIP LOCKED
  LOOP
    total := total+admin.enqueue_marketing_campaign(campaign_id);
  END LOOP;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION admin.enqueue_marketing_campaigns() FROM PUBLIC,anon,authenticated;
