-- Expose the vendor's rating (kept in sync by reviews_recompute_vendor_rating)
-- so the RN app can show a real rating instead of a hardcoded placeholder.
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
  v."review_count"                          AS "review_count"
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
WHERE v."status" = 'PUBLISHED';
