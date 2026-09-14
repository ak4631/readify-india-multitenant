-- Nearby search without PostGIS/earthdistance: an indexed bounding-box
-- pre-filter (uses vendor_addresses_latitude_longitude_idx) narrows the row
-- set, then exact Haversine distance in SQL does the real radius cutoff,
-- sort, and distance_km output. Fine at directory scale; revisit with
-- PostGIS only if/when row counts make the bounding box ineffective.
--
-- Required params (p_latitude, p_longitude) are listed first since Postgres
-- requires all-defaulted params to trail; callers should use named
-- parameters (supabase.rpc('nearby_vendors', { p_latitude, p_longitude, ... }))
-- so call-site order doesn't matter in practice.
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
    WHERE v."status" = 'PUBLISHED'
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
