-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "admin";

-- CreateEnum
CREATE TYPE "admin"."UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "admin"."VendorStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "admin"."VerificationStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "admin"."DocumentType" AS ENUM ('BUSINESS_REGISTRATION', 'GST_CERTIFICATE', 'PAN', 'OWNER_ID', 'ADDRESS_PROOF', 'TRAINER_CERTIFICATION', 'EDUCATIONAL_DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "admin"."FacilityStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "admin"."CategoryStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "admin"."PlanStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "admin"."DurationUnit" AS ENUM ('DAYS', 'MONTHS', 'YEARS', 'SESSIONS');

-- CreateEnum
CREATE TYPE "admin"."DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "admin"."SlotStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "admin"."BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "admin"."MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "admin"."ReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'DELETED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "admin"."TrainerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "admin"."TeacherStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "admin"."CourseMode" AS ENUM ('OFFLINE', 'ONLINE', 'HYBRID');

-- CreateEnum
CREATE TYPE "admin"."CourseStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "admin"."LectureStatus" AS ENUM ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "admin"."users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "password_hash" TEXT NOT NULL,
    "status" "admin"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "admin"."user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "admin"."vendor_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "status" "admin"."CategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "description" TEXT,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "website" TEXT,
    "status" "admin"."VendorStatus" NOT NULL DEFAULT 'DRAFT',
    "verification_status" "admin"."VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "average_rating" DECIMAL(2,1),
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."vendor_addresses" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "address_line_1" TEXT NOT NULL,
    "address_line_2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'India',
    "pincode" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."vendor_verifications" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "document_type" "admin"."DocumentType" NOT NULL,
    "document_number" TEXT,
    "document_url" TEXT NOT NULL,
    "status" "admin"."VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verified_by" TEXT,
    "verified_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."facilities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "icon" TEXT,
    "status" "admin"."FacilityStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."vendor_facilities" (
    "vendor_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,

    CONSTRAINT "vendor_facilities_pkey" PRIMARY KEY ("vendor_id","facility_id")
);

-- CreateTable
CREATE TABLE "admin"."membership_plans" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "duration_value" INTEGER NOT NULL,
    "duration_unit" "admin"."DurationUnit" NOT NULL,
    "status" "admin"."PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."vendor_schedules" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "day_of_week" "admin"."DayOfWeek" NOT NULL,
    "open_time" TIME NOT NULL,
    "close_time" TIME NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "vendor_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."booking_slots" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "slot_date" DATE NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "capacity" INTEGER NOT NULL,
    "available_capacity" INTEGER NOT NULL,
    "status" "admin"."SlotStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "booking_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."bookings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "slot_id" TEXT,
    "booking_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "admin"."BookingStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."vendor_media" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "media_url" TEXT NOT NULL,
    "media_type" "admin"."MediaType" NOT NULL DEFAULT 'IMAGE',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."reviews" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "booking_id" TEXT,
    "rating" INTEGER NOT NULL,
    "review_text" TEXT,
    "status" "admin"."ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."trainers" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "experience_years" INTEGER,
    "profile_photo_url" TEXT,
    "status" "admin"."TrainerStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trainers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."trainer_specializations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "trainer_specializations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."trainer_specialization_map" (
    "trainer_id" TEXT NOT NULL,
    "specialization_id" TEXT NOT NULL,

    CONSTRAINT "trainer_specialization_map_pkey" PRIMARY KEY ("trainer_id","specialization_id")
);

-- CreateTable
CREATE TABLE "admin"."trainer_pricing" (
    "id" TEXT NOT NULL,
    "trainer_id" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "duration_value" INTEGER NOT NULL,
    "duration_unit" "admin"."DurationUnit" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."trainer_availability" (
    "id" TEXT NOT NULL,
    "trainer_id" TEXT NOT NULL,
    "day_of_week" "admin"."DayOfWeek" NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,

    CONSTRAINT "trainer_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."study_cafe_details" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "seating_capacity" INTEGER,

    CONSTRAINT "study_cafe_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."menu_categories" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."menu_items" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "image_url" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."exam_hub_details" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "exam_hub_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."teachers" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "experience_years" INTEGER,
    "profile_photo_url" TEXT,
    "status" "admin"."TeacherStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."subjects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."courses" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "subject_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "duration_value" INTEGER,
    "duration_unit" "admin"."DurationUnit",
    "mode" "admin"."CourseMode" NOT NULL DEFAULT 'OFFLINE',
    "status" "admin"."CourseStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."course_teachers" (
    "course_id" TEXT NOT NULL,
    "teacher_id" TEXT NOT NULL,

    CONSTRAINT "course_teachers_pkey" PRIMARY KEY ("course_id","teacher_id")
);

-- CreateTable
CREATE TABLE "admin"."lectures" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "teacher_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mode" "admin"."CourseMode" NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "meeting_url" TEXT,
    "recording_url" TEXT,
    "status" "admin"."LectureStatus" NOT NULL DEFAULT 'SCHEDULED',

    CONSTRAINT "lectures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "admin"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "admin"."users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "admin"."roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "admin"."permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_categories_name_key" ON "admin"."vendor_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_categories_slug_key" ON "admin"."vendor_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_slug_key" ON "admin"."vendors"("slug");

-- CreateIndex
CREATE INDEX "vendors_category_id_idx" ON "admin"."vendors"("category_id");

-- CreateIndex
CREATE INDEX "vendors_status_idx" ON "admin"."vendors"("status");

-- CreateIndex
CREATE INDEX "vendors_verification_status_idx" ON "admin"."vendors"("verification_status");

-- CreateIndex
CREATE INDEX "vendors_created_at_idx" ON "admin"."vendors"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_addresses_vendor_id_key" ON "admin"."vendor_addresses"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_addresses_city_idx" ON "admin"."vendor_addresses"("city");

-- CreateIndex
CREATE INDEX "vendor_addresses_state_idx" ON "admin"."vendor_addresses"("state");

-- CreateIndex
CREATE INDEX "vendor_addresses_pincode_idx" ON "admin"."vendor_addresses"("pincode");

-- CreateIndex
CREATE INDEX "vendor_verifications_vendor_id_idx" ON "admin"."vendor_verifications"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_verifications_status_idx" ON "admin"."vendor_verifications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "facilities_name_key" ON "admin"."facilities"("name");

-- CreateIndex
CREATE INDEX "membership_plans_vendor_id_idx" ON "admin"."membership_plans"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_schedules_vendor_id_day_of_week_key" ON "admin"."vendor_schedules"("vendor_id", "day_of_week");

-- CreateIndex
CREATE INDEX "booking_slots_vendor_id_slot_date_idx" ON "admin"."booking_slots"("vendor_id", "slot_date");

-- CreateIndex
CREATE UNIQUE INDEX "booking_slots_vendor_id_slot_date_start_time_end_time_key" ON "admin"."booking_slots"("vendor_id", "slot_date", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "bookings_user_id_idx" ON "admin"."bookings"("user_id");

-- CreateIndex
CREATE INDEX "bookings_vendor_id_idx" ON "admin"."bookings"("vendor_id");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "admin"."bookings"("status");

-- CreateIndex
CREATE INDEX "vendor_media_vendor_id_idx" ON "admin"."vendor_media"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_booking_id_key" ON "admin"."reviews"("booking_id");

-- CreateIndex
CREATE INDEX "reviews_vendor_id_idx" ON "admin"."reviews"("vendor_id");

-- CreateIndex
CREATE INDEX "reviews_status_idx" ON "admin"."reviews"("status");

-- CreateIndex
CREATE INDEX "trainers_vendor_id_idx" ON "admin"."trainers"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_specializations_name_key" ON "admin"."trainer_specializations"("name");

-- CreateIndex
CREATE INDEX "trainer_availability_trainer_id_idx" ON "admin"."trainer_availability"("trainer_id");

-- CreateIndex
CREATE UNIQUE INDEX "study_cafe_details_vendor_id_key" ON "admin"."study_cafe_details"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "exam_hub_details_vendor_id_key" ON "admin"."exam_hub_details"("vendor_id");

-- CreateIndex
CREATE INDEX "teachers_vendor_id_idx" ON "admin"."teachers"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_name_key" ON "admin"."subjects"("name");

-- CreateIndex
CREATE INDEX "lectures_course_id_idx" ON "admin"."lectures"("course_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "admin"."audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "admin"."audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "admin"."audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "admin"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "admin"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."vendors" ADD CONSTRAINT "vendors_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "admin"."vendor_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."vendors" ADD CONSTRAINT "vendors_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "admin"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."vendors" ADD CONSTRAINT "vendors_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "admin"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."vendor_addresses" ADD CONSTRAINT "vendor_addresses_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."vendor_verifications" ADD CONSTRAINT "vendor_verifications_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."vendor_verifications" ADD CONSTRAINT "vendor_verifications_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "admin"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."vendor_facilities" ADD CONSTRAINT "vendor_facilities_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."vendor_facilities" ADD CONSTRAINT "vendor_facilities_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "admin"."facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."membership_plans" ADD CONSTRAINT "membership_plans_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."vendor_schedules" ADD CONSTRAINT "vendor_schedules_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."booking_slots" ADD CONSTRAINT "booking_slots_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."bookings" ADD CONSTRAINT "bookings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."bookings" ADD CONSTRAINT "bookings_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."bookings" ADD CONSTRAINT "bookings_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "admin"."membership_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."bookings" ADD CONSTRAINT "bookings_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "admin"."booking_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."vendor_media" ADD CONSTRAINT "vendor_media_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."reviews" ADD CONSTRAINT "reviews_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."reviews" ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "admin"."bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."trainers" ADD CONSTRAINT "trainers_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."trainer_specialization_map" ADD CONSTRAINT "trainer_specialization_map_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "admin"."trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."trainer_specialization_map" ADD CONSTRAINT "trainer_specialization_map_specialization_id_fkey" FOREIGN KEY ("specialization_id") REFERENCES "admin"."trainer_specializations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."trainer_pricing" ADD CONSTRAINT "trainer_pricing_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "admin"."trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."trainer_availability" ADD CONSTRAINT "trainer_availability_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "admin"."trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."study_cafe_details" ADD CONSTRAINT "study_cafe_details_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."menu_categories" ADD CONSTRAINT "menu_categories_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "admin"."menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."exam_hub_details" ADD CONSTRAINT "exam_hub_details_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."teachers" ADD CONSTRAINT "teachers_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."courses" ADD CONSTRAINT "courses_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "admin"."vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."courses" ADD CONSTRAINT "courses_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "admin"."subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."course_teachers" ADD CONSTRAINT "course_teachers_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "admin"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."course_teachers" ADD CONSTRAINT "course_teachers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "admin"."teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."lectures" ADD CONSTRAINT "lectures_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "admin"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."lectures" ADD CONSTRAINT "lectures_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "admin"."teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin"."audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddCheckConstraint
ALTER TABLE "admin"."reviews" ADD CONSTRAINT "reviews_rating_range" CHECK (rating BETWEEN 1 AND 5);
