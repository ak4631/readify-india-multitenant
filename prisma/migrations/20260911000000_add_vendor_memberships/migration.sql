CREATE TYPE "admin"."VendorMemberRole" AS ENUM ('OWNER', 'MANAGER');

CREATE TABLE "admin"."vendor_members" (
    "vendor_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "admin"."VendorMemberRole" NOT NULL DEFAULT 'OWNER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_members_pkey" PRIMARY KEY ("vendor_id", "user_id")
);

CREATE INDEX "vendor_members_user_id_idx" ON "admin"."vendor_members"("user_id");

ALTER TABLE "admin"."vendor_members"
ADD CONSTRAINT "vendor_members_vendor_id_fkey"
FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin"."vendor_members"
ADD CONSTRAINT "vendor_members_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
