CREATE TYPE "admin"."PartnerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "admin"."partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" "admin"."PartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "admin"."users" ADD COLUMN "partner_id" TEXT;
ALTER TABLE "admin"."vendors" ADD COLUMN "partner_id" TEXT;

-- Preserve current tenants by grouping listings around their existing account owner.
INSERT INTO "admin"."partners" ("id", "name", "email", "created_by")
SELECT
  'partner_' || md5(vm."user_id"),
  COALESCE(NULLIF(u."name", ''), MIN(v."name")),
  u."email",
  MIN(v."created_by")
FROM "admin"."vendor_members" vm
JOIN "admin"."users" u ON u."id" = vm."user_id"
JOIN "admin"."vendors" v ON v."id" = vm."vendor_id"
GROUP BY vm."user_id", u."name", u."email"
ON CONFLICT ("id") DO NOTHING;

UPDATE "admin"."users" u
SET "partner_id" = 'partner_' || md5(u."id")
WHERE EXISTS (
  SELECT 1 FROM "admin"."partners" p
  WHERE p."id" = 'partner_' || md5(u."id")
);

UPDATE "admin"."vendors" v
SET "partner_id" = chosen."partner_id"
FROM (
  SELECT DISTINCT ON (vm."vendor_id")
    vm."vendor_id",
    'partner_' || md5(vm."user_id") AS "partner_id"
  FROM "admin"."vendor_members" vm
  ORDER BY vm."vendor_id", vm."created_at"
) chosen
WHERE v."id" = chosen."vendor_id";

-- Listings without a login become standalone partners and can be consolidated later.
INSERT INTO "admin"."partners" ("id", "name", "email", "phone", "created_by")
SELECT
  'partner_listing_' || md5(v."id"),
  v."name",
  v."email",
  v."phone",
  v."created_by"
FROM "admin"."vendors" v
WHERE v."partner_id" IS NULL;

UPDATE "admin"."vendors"
SET "partner_id" = 'partner_listing_' || md5("id")
WHERE "partner_id" IS NULL;

-- Every existing user attached to a listing inherits that listing's organization.
UPDATE "admin"."users" u
SET "partner_id" = owned."partner_id"
FROM (
  SELECT DISTINCT ON (vm."user_id") vm."user_id", v."partner_id"
  FROM "admin"."vendor_members" vm
  JOIN "admin"."vendors" v ON v."id" = vm."vendor_id"
  ORDER BY vm."user_id", vm."created_at"
) owned
WHERE u."id" = owned."user_id";

ALTER TABLE "admin"."vendors" ALTER COLUMN "partner_id" SET NOT NULL;

CREATE TABLE "admin"."listing_assignments" (
    "vendor_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "listing_assignments_pkey" PRIMARY KEY ("vendor_id", "user_id")
);

CREATE INDEX "partners_status_idx" ON "admin"."partners"("status");
CREATE INDEX "users_partner_id_idx" ON "admin"."users"("partner_id");
CREATE INDEX "vendors_partner_id_idx" ON "admin"."vendors"("partner_id");
CREATE INDEX "listing_assignments_user_id_idx" ON "admin"."listing_assignments"("user_id");

ALTER TABLE "admin"."partners" ADD CONSTRAINT "partners_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admin"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admin"."users" ADD CONSTRAINT "users_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "admin"."partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "admin"."vendors" ADD CONSTRAINT "vendors_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "admin"."partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "admin"."listing_assignments" ADD CONSTRAINT "listing_assignments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin"."listing_assignments" ADD CONSTRAINT "listing_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "admin"."roles" SET "name" = 'PARTNER_ADMIN' WHERE "name" = 'VENDOR_ADMIN' AND NOT EXISTS (SELECT 1 FROM "admin"."roles" WHERE "name" = 'PARTNER_ADMIN');
