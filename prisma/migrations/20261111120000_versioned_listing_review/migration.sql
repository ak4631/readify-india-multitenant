-- Additive: preserves IDs, approved content, purchases and all decision history.
ALTER TABLE admin.vendors ADD COLUMN content_version integer NOT NULL DEFAULT 0;
ALTER TABLE admin.vendors ADD COLUMN submission_version integer NOT NULL DEFAULT 0;
CREATE TABLE admin.listing_revisions (
 id text PRIMARY KEY, vendor_id text NOT NULL REFERENCES admin.vendors(id),
 base_version integer NOT NULL CHECK(base_version>=0), base_snapshot jsonb,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PENDING','APPROVED','REJECTED','WITHDRAWN')),
 requested_by text NOT NULL, submitted_at timestamptz, reviewed_at timestamptz,
 reviewed_by text, reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX listing_revision_active ON admin.listing_revisions(vendor_id) WHERE status IN ('DRAFT','PENDING');
CREATE INDEX listing_revisions_vendor_status ON admin.listing_revisions(vendor_id,status);
ALTER TABLE admin.listing_changes ADD COLUMN revision_id text REFERENCES admin.listing_revisions(id);
-- Group existing pending changes without approving or dropping them.
INSERT INTO admin.listing_revisions(id,vendor_id,base_version,status,requested_by,submitted_at)
 SELECT 'legacy-'||c.vendor_id,c.vendor_id,0,'PENDING',min(c.requested_by),min(c.created_at)
 FROM admin.listing_changes c WHERE c.status='PENDING' GROUP BY c.vendor_id;
UPDATE admin.listing_changes SET revision_id='legacy-'||vendor_id WHERE status='PENDING';
CREATE TABLE admin.listing_submissions (
 id text PRIMARY KEY, vendor_id text NOT NULL REFERENCES admin.vendors(id), version integer NOT NULL,
 snapshot jsonb NOT NULL, digest text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','WITHDRAWN')),
 requested_by text NOT NULL, reviewed_by text, reason text,
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
 UNIQUE(vendor_id,version)
);
CREATE INDEX listing_submissions_status_created ON admin.listing_submissions(status,created_at);
REVOKE ALL ON admin.listing_revisions,admin.listing_submissions FROM anon,authenticated;
CREATE FUNCTION admin.protect_review_payload() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,admin AS $$
DECLARE state text;
BEGIN
 IF TG_TABLE_NAME='listing_submissions' THEN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Submitted evidence is immutable'; END IF;
   IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.digest IS DISTINCT FROM OLD.digest OR NEW.version IS DISTINCT FROM OLD.version OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN RAISE EXCEPTION 'Submitted evidence is immutable'; END IF;
   RETURN NEW;
 END IF;
 IF TG_OP='INSERT' THEN
   IF NEW.revision_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM admin.listing_revisions WHERE id=NEW.revision_id AND status='DRAFT') THEN RAISE EXCEPTION 'Submitted changes are immutable'; END IF;
   RETURN NEW;
 END IF;
 IF OLD.revision_id IS NOT NULL THEN
   SELECT status INTO state FROM admin.listing_revisions WHERE id=OLD.revision_id;
   IF state<>'DRAFT' AND (TG_OP='DELETE' OR NEW.payload IS DISTINCT FROM OLD.payload OR NEW.target_id IS DISTINCT FROM OLD.target_id OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.revision_id IS DISTINCT FROM OLD.revision_id OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id) THEN RAISE EXCEPTION 'Submitted changes are immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_submission BEFORE UPDATE OR DELETE ON admin.listing_submissions FOR EACH ROW EXECUTE FUNCTION admin.protect_review_payload();
CREATE TRIGGER immutable_listing_change BEFORE INSERT OR UPDATE OR DELETE ON admin.listing_changes FOR EACH ROW EXECUTE FUNCTION admin.protect_review_payload();

ALTER TABLE admin.audit_logs ADD COLUMN partner_id text;
CREATE INDEX audit_logs_partner_created ON admin.audit_logs(partner_id,created_at);
UPDATE admin.audit_logs a SET partner_id=v.partner_id FROM admin.vendors v WHERE a.entity_type='vendor' AND a.entity_id=v.id;
UPDATE admin.audit_logs a SET partner_id=a.entity_id WHERE a.entity_type='partner';
UPDATE admin.audit_logs a SET partner_id=v.partner_id FROM admin.vendors v WHERE a.partner_id IS NULL AND coalesce(a.new_value->>'vendorId',a.old_value->>'vendorId')=v.id;
UPDATE admin.audit_logs a SET partner_id=u.partner_id FROM admin.users u WHERE a.partner_id IS NULL AND a.entity_type='user' AND a.entity_id=u.id;

CREATE FUNCTION admin.protect_revision_envelope() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,admin AS $$
BEGIN
 IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id OR NEW.base_version IS DISTINCT FROM OLD.base_version OR NEW.base_snapshot IS DISTINCT FROM OLD.base_snapshot THEN RAISE EXCEPTION 'Review base evidence is immutable'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status='DRAFT' AND NEW.status IN ('PENDING','WITHDRAWN')) OR (OLD.status='PENDING' AND NEW.status IN ('APPROVED','REJECTED','WITHDRAWN'))) THEN RAISE EXCEPTION 'Invalid revision transition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_revision_base BEFORE UPDATE ON admin.listing_revisions FOR EACH ROW EXECUTE FUNCTION admin.protect_revision_envelope();

ALTER TABLE admin.partners ADD COLUMN application_version integer NOT NULL DEFAULT 1;

-- Explicit approval predicate keeps web counts and customer discovery aligned.
CREATE OR REPLACE VIEW "public"."published_listings" AS
SELECT
  v."id"                                    AS "id",
  v."name"                                  AS "name",
  v."slug"                                  AS "slug",
  v."description"                           AS "description",
  regexp_replace(c."slug", '-', '_', 'g')   AS "category",
  a."address_line_1"                        AS "address_line_1",
  a."address_line_2"                        AS "address_line_2",
  NULL::text                                AS "locality",
  a."city"                                  AS "city",
  a."state"                                 AS "state",
  a."pincode"                               AS "postal_code",
  v."website"                               AS "website_url",
  'published'::text                         AS "status",
  true                                      AS "is_active",
  img."media_url"                           AS "image_url",
  v."created_at"                            AS "created_at",
  v."average_rating"                        AS "average_rating",
  v."review_count"                          AS "review_count",
  a."latitude"                              AS "latitude",
  a."longitude"                             AS "longitude"
FROM "admin"."vendors" v
JOIN "admin"."vendor_categories" c
  ON c."id" = v."category_id"
LEFT JOIN "admin"."vendor_addresses" a
  ON a."vendor_id" = v."id"
LEFT JOIN LATERAL (
  SELECT vm."media_url"
  FROM "admin"."vendor_media" vm
  WHERE vm."vendor_id" = v."id"
    AND vm."media_type" = 'IMAGE'
  ORDER BY vm."is_primary" DESC, vm."sort_order" ASC, vm."created_at" ASC
  LIMIT 1
) img ON true
WHERE v."status" = 'PUBLISHED' AND c."launch_enabled" AND c."status" = 'ACTIVE'
AND EXISTS (SELECT 1 FROM admin.partners p WHERE p.id = v.partner_id AND p.status = 'ACTIVE' AND p.approval_status = 'APPROVED');

CREATE OR REPLACE FUNCTION "public"."nearby_vendors"(
  p_latitude numeric,
  p_longitude numeric,
  p_category text DEFAULT NULL,
  p_radius_km numeric DEFAULT 10,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  id text,
  name text,
  slug text,
  description text,
  category text,
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  postal_code text,
  latitude numeric,
  longitude numeric,
  website_url text,
  image_url text,
  average_rating numeric,
  review_count int,
  distance_km numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = admin, public
AS $$
DECLARE
  v_lat_delta numeric;
  v_lng_delta numeric;
BEGIN
  IF p_latitude IS NULL OR p_longitude IS NULL THEN
    RAISE EXCEPTION 'p_latitude and p_longitude are required';
  END IF;

  -- 1 degree latitude ~= 111km everywhere; 1 degree longitude shrinks by
  -- cos(latitude). Padding doesn't need to be exact -- it only has to be
  -- wide enough to never exclude a true match; the Haversine filter below
  -- does the real, precise cutoff.
  v_lat_delta := p_radius_km / 111.0;
  v_lng_delta := p_radius_km / (111.0 * GREATEST(cos(radians(p_latitude)), 0.01));

  RETURN QUERY
  SELECT filtered.* FROM (
    SELECT
      v."id",
      v."name",
      v."slug",
      v."description",
      regexp_replace(c."slug", '-', '_', 'g')      AS "category",
      a."address_line_1",
      a."address_line_2",
      a."city",
      a."state",
      a."pincode"                                  AS "postal_code",
      a."latitude",
      a."longitude",
      v."website"                                  AS "website_url",
      img."media_url"                              AS "image_url",
      v."average_rating",
      v."review_count",
      ROUND((
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(p_latitude)) * cos(radians(a."latitude"))
              * cos(radians(a."longitude") - radians(p_longitude))
              + sin(radians(p_latitude)) * sin(radians(a."latitude"))
          ))
        )
      )::numeric, 2)                                AS "distance_km"
    FROM "admin"."vendors" v
    JOIN "admin"."vendor_categories" c ON c."id" = v."category_id"
    JOIN "admin"."vendor_addresses" a ON a."vendor_id" = v."id"
    LEFT JOIN LATERAL (
      SELECT vm."media_url"
      FROM "admin"."vendor_media" vm
      WHERE vm."vendor_id" = v."id" AND vm."media_type" = 'IMAGE'
      ORDER BY vm."is_primary" DESC, vm."sort_order" ASC, vm."created_at" ASC
      LIMIT 1
    ) img ON true
    WHERE v."status" = 'PUBLISHED' AND c."launch_enabled" AND c."status" = 'ACTIVE'
      AND EXISTS (SELECT 1 FROM admin.partners p WHERE p.id = v.partner_id AND p.status = 'ACTIVE' AND p.approval_status = 'APPROVED')
      AND a."latitude" IS NOT NULL
      AND a."longitude" IS NOT NULL
      AND a."latitude" BETWEEN p_latitude - v_lat_delta AND p_latitude + v_lat_delta
      AND a."longitude" BETWEEN p_longitude - v_lng_delta AND p_longitude + v_lng_delta
      AND (p_category IS NULL OR regexp_replace(c."slug", '-', '_', 'g') = p_category)
  ) filtered
  WHERE filtered."distance_km" <= p_radius_km
  ORDER BY filtered."distance_km" ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."nearby_vendors" TO anon, authenticated;

-- Editable envelopes add explicit draft/withdrawn states to the original queue.
-- The envelope now owns concurrency. A newly created item and a follow-up edit
-- to it must coexist in the same submitted revision.
DROP INDEX admin.listing_changes_one_pending_target;
ALTER TABLE admin.listing_changes DROP CONSTRAINT listing_changes_status_check;
ALTER TABLE admin.listing_changes ADD CONSTRAINT listing_changes_status_check
  CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN'));

