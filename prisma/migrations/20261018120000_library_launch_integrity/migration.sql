CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE admin.vendor_categories ADD COLUMN launch_enabled boolean NOT NULL DEFAULT false;
UPDATE admin.vendor_categories SET launch_enabled = true WHERE slug = 'library';
CREATE VIEW public.service_catalog AS
SELECT replace(slug, '-', '_') AS id, name, (launch_enabled AND status = 'ACTIVE') AS enabled FROM admin.vendor_categories;
GRANT SELECT ON public.service_catalog TO anon, authenticated;

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
AND EXISTS (SELECT 1 FROM admin.partners p WHERE p.id = v.partner_id AND p.status = 'ACTIVE');

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
      AND EXISTS (SELECT 1 FROM admin.partners p WHERE p.id = v.partner_id AND p.status = 'ACTIVE')
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

CREATE OR REPLACE VIEW public.listing_reviews AS
SELECT r.id, r.vendor_id, r.rating, r.review_text, r.user_name, r.created_at, r.owner_reply, r.replied_at
FROM admin.reviews r JOIN public.published_listings v ON v.id = r.vendor_id
WHERE r.status = 'PUBLISHED' ORDER BY r.created_at DESC;
