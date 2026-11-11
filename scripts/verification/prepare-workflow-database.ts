// Disposable local verification only. Never reads the project's .env.
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import bcrypt from "bcryptjs";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../../src/config/permissions";

async function main() {
  const connectionString = process.env.WORKFLOW_TEST_DATABASE_URL;
  if (!connectionString)
    throw new Error("Set WORKFLOW_TEST_DATABASE_URL explicitly");
  const url = new URL(connectionString);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/readify_workflow_test"
  )
    throw new Error(
      "Only a local database named readify_workflow_test is allowed",
    );
  const db = new Client({ connectionString });
  await db.connect();
  try {
    await db.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE public.profiles(id uuid PRIMARY KEY,full_name text,avatar_url text,role text DEFAULT 'user',is_active boolean DEFAULT true,created_at timestamptz DEFAULT now());`);
    for (const name of readdirSync("prisma/migrations")
      .filter((n) => /^\d/.test(n))
      .sort()) {
      if (name === "20260927130000_apply_pending_seat_rollout") continue;
      const sql = readFileSync(
        `prisma/migrations/${name}/migration.sql`,
        "utf8",
      ).replace(
        /ALTER TABLE "admin"\."coworking_space_details"\s+RENAME CONSTRAINT "study_cafe_details_(?:id|vendor_id)_not_null" TO "coworking_space_details_(?:id|vendor_id)_not_null";/g,
        "",
      );
      await db.query(sql);
    }
    for (const p of PERMISSIONS)
      await db.query(
        "INSERT INTO admin.permissions(id,key,description) VALUES($1,$1,$2)",
        [p.key, p.description],
      );
    for (const role of ["SUPER_ADMIN", "PARTNER_ADMIN"]) {
      await db.query(
        "INSERT INTO admin.roles(id,name,updated_at) VALUES($1,$1,now())",
        [role],
      );
      const keys = ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS];
      for (const key of keys === "*" ? PERMISSIONS.map((p) => p.key) : keys)
        await db.query(
          "INSERT INTO admin.role_permissions(role_id,permission_id) VALUES($1,$2)",
          [role, key],
        );
    }
    const hash = await bcrypt.hash("Workflow-test-only-72!", 10);
    for (const [id, role] of [
      ["admin", "SUPER_ADMIN"],
      ["owner", "PARTNER_ADMIN"],
      ["other", "PARTNER_ADMIN"],
    ]) {
      await db.query(
        "INSERT INTO admin.users(id,name,email,password_hash,updated_at) VALUES($1,$1,$2,$3,now())",
        [id, `${id}@test.invalid`, hash],
      );
      await db.query(
        "INSERT INTO admin.user_roles(user_id,role_id) VALUES($1,$2)",
        [id, role],
      );
    }
    await db.query(`INSERT INTO admin.partners(id,name,created_by,updated_at) VALUES('org','Workflow Library Organization','admin',now()),('other-org','Other Organization','admin',now());
    UPDATE admin.users SET partner_id=CASE WHEN id='owner' THEN 'org' ELSE 'other-org' END WHERE id IN ('owner','other');
    INSERT INTO admin.vendor_categories(id,name,slug,launch_enabled,updated_at) VALUES('library','Library','library',true,now());
    INSERT INTO admin.facilities(id,name) VALUES('wifi','WiFi'),('ac','AC');
    INSERT INTO admin.vendors(id,name,slug,phone,category_id,partner_id,created_by,updated_at) VALUES('listing','Workflow Library','workflow-library','9999999999','library','org','owner',now());
    INSERT INTO admin.vendor_addresses(id,vendor_id,address_line_1,city,state,pincode,latitude,longitude,updated_at) VALUES('address','listing','123 Test Road','Pune','Maharashtra','411001',18.52,73.85,now());
    INSERT INTO admin.vendor_verifications(id,vendor_id,document_type,document_url,status,updated_at) SELECT 'doc-'||d,'listing',d::admin."DocumentType",'https://example.com/test.pdf','VERIFIED',now() FROM unnest(ARRAY['BUSINESS_REGISTRATION','ADDRESS_PROOF','OWNER_ID']) d;
    INSERT INTO admin.vendor_schedules(id,vendor_id,day_of_week,open_time,close_time) SELECT 'schedule-'||d,'listing',d::admin."DayOfWeek",'06:00','22:00' FROM unnest(ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']) d;
    INSERT INTO admin.library_seat_types(id,vendor_id,name,total_count) VALUES('seats','listing','Standard',10);
    INSERT INTO admin.membership_plans(id,vendor_id,name,price,duration_value,duration_unit,daily_hours,daily_start,is_flexible,updated_at) VALUES
      ('flex','listing','Flex',10,1,'HOURS',2,null,true,now()),
      ('monthly','listing','Monthly',1000,1,'MONTHS',8,'08:00',false,now()),
      ('quarterly','listing','Quarterly',2500,3,'MONTHS',8,'08:00',false,now()),
      ('yearly','listing','Yearly',9000,1,'YEARS',8,'08:00',false,now());`);
    console.log("Disposable workflow fixtures prepared.");
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
