-- CreateTable
CREATE TABLE "admin"."library_seat_types" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "total_count" INTEGER NOT NULL,

    CONSTRAINT "library_seat_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_seat_types_vendor_id_idx" ON "admin"."library_seat_types"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_seat_types_vendor_id_name_key" ON "admin"."library_seat_types"("vendor_id", "name");

-- AddForeignKey
ALTER TABLE "admin"."library_seat_types" ADD CONSTRAINT "library_seat_types_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
