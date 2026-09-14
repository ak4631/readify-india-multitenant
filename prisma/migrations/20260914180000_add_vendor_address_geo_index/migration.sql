-- Supports the bounding-box pre-filter in public.nearby_vendors.
CREATE INDEX IF NOT EXISTS "vendor_addresses_latitude_longitude_idx"
  ON "admin"."vendor_addresses" ("latitude", "longitude");
