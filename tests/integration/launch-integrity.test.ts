import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { launchDatabase } from "../helpers/launch-database";

describe("Library launch database contracts (isolated PostgreSQL)", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await launchDatabase();
    await db.exec(`
      INSERT INTO admin.users(id,name,email,password_hash,updated_at) VALUES('staff','Staff','staff@test.invalid','hash',now());
      INSERT INTO admin.partners(id,name,created_by,updated_at) VALUES('partner','Partner','staff',now());
      INSERT INTO admin.vendor_categories(id,name,slug,launch_enabled,updated_at) VALUES('library','Library','library',true,now()),('gym','Gym','gym',false,now());
      INSERT INTO admin.vendors(id,name,slug,phone,category_id,partner_id,status,created_by,updated_at)
      VALUES('vendor','Library','library','9999999999','library','partner','PUBLISHED','staff',now());
      INSERT INTO admin.library_seat_types(id,vendor_id,name,total_count) VALUES('type','vendor','Standard',1);
      INSERT INTO admin.vendor_schedules(id,vendor_id,day_of_week,open_time,close_time,is_closed)
      SELECT 'schedule-'||d,'vendor',d::admin."DayOfWeek",'06:00','22:00',false FROM unnest(ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']) d;
      INSERT INTO admin.membership_plans(id,vendor_id,name,price,duration_value,duration_unit,daily_hours,is_flexible,updated_at)
      VALUES('flex','vendor','Flex',10,1,'HOURS',2,true,now());
      INSERT INTO admin.membership_plans(id,vendor_id,name,price,duration_value,duration_unit,daily_hours,daily_start,updated_at)
      VALUES('monthly','vendor','Monthly',1000,1,'MONTHS',2,'10:00',now());
      SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
    `);
  }, 60_000);
  afterAll(async () => {
    if (db) await db.close();
  });

  it("keeps Flex records separate from subscriptions and rejects 15 days", async () => {
    await expect(
      db.query(
        `SELECT * FROM admin.reserve_purchase('flex','vendor','flex','2030-01-01','08:00',15)`,
      ),
    ).rejects.toThrow(/1-14/);
    const result = await db.query(
      `SELECT * FROM admin.reserve_purchase('flex','vendor','flex','2030-01-01','08:00',2)`,
    );
    expect(result.rows).toHaveLength(1);
    expect((result.rows[0] as { amount_paise: number }).amount_paise).toBe(
      4600,
    );
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM admin.flex_bookings",
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM admin.subscriptions",
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it("rejects a conflicting span and allows adjacent daily windows on the same seat", async () => {
    await expect(
      db.query(
        `SELECT * FROM admin.reserve_purchase('flex','vendor','flex','2030-01-01','09:00',2)`,
      ),
    ).rejects.toThrow(/No seat/);
    const result = await db.query(
      `SELECT * FROM admin.reserve_purchase('subscription','vendor','monthly','2030-01-01',NULL,NULL)`,
    );
    expect(result.rows).toHaveLength(1);
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int n FROM admin.seat_reservations WHERE source='subscription'",
        )
      ).rows[0].n,
    ).toBe(31);
  });

  it("enforces overlap even when a caller bypasses the allocator", async () => {
    await expect(
      db.exec(`INSERT INTO admin.flex_bookings(id,user_id,vendor_id,plan_id,seat_id,start_date,days,slot_start,slot_hours,amount,booking_code,updated_at)
      SELECT 'bypass','user','vendor','flex',id,'2030-01-01',1,'08:30',2,100,'BYPASS',now() FROM admin.library_seats WHERE vendor_id='vendor' LIMIT 1`),
    ).rejects.toThrow(/seat_reservations_no_overlap/);
  });

  it("releases all daily windows on cancellation", async () => {
    await db.exec(
      "UPDATE admin.flex_bookings SET status='CANCELLED' WHERE vendor_id='vendor'",
    );
    const result = await db.query(
      `SELECT * FROM admin.reserve_purchase('flex','vendor','flex','2030-01-01','08:00',2)`,
    );
    expect(result.rows).toHaveLength(1);
  });

  it("blocks purchases and discovery for an inactive service", async () => {
    await db.exec(
      "UPDATE admin.vendor_categories SET launch_enabled=false WHERE id='library'",
    );
    expect(
      (await db.query("SELECT * FROM public.published_listings")).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        `SELECT * FROM admin.reserve_purchase('flex','vendor','flex','2030-02-01','08:00',1)`,
      ),
    ).rejects.toThrow(/not available/);
  });

  it("handles overnight windows consistently across allocation and the database constraint", async () => {
    await db.exec(
      "UPDATE admin.vendor_categories SET launch_enabled=true WHERE id='library'; UPDATE admin.vendor_schedules SET open_time='22:00',close_time='06:00' WHERE vendor_id='vendor';",
    );
    await db.query(
      `SELECT * FROM admin.reserve_purchase('flex','vendor','flex','2032-01-01','02:00',1)`,
    );
    const result = await db.query<{ beginning: string }>(
      `SELECT to_char(lower("window") AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS beginning FROM admin.seat_reservations WHERE source='flex' AND lower("window")>'2031-01-01'`,
    );
    expect(String(result.rows[0].beginning)).toContain("2032-01-02");
    await expect(
      db.query(
        `SELECT * FROM admin.reserve_purchase('flex','vendor','flex','2032-01-01','03:00',1)`,
      ),
    ).rejects.toThrow(/No seat/);
    await expect(
      db.exec(
        "UPDATE admin.library_seats SET is_active=false WHERE vendor_id='vendor'",
      ),
    ).rejects.toThrow(/reservations/);
  });

  it("excludes closed-day Flex spans and exposes an exact plan-defined subscription start", async () => {
    await db.exec(
      "UPDATE admin.vendor_schedules SET open_time='06:00',close_time='22:00',is_closed=false WHERE vendor_id='vendor'; UPDATE admin.membership_plans SET daily_start='10:15' WHERE id='monthly';",
    );
    const options = await db.query<{ start_time: string }>(
      "SELECT * FROM public.get_purchase_options('vendor','monthly','2033-01-01',NULL)",
    );
    expect(options.rows.map((row) => row.start_time)).toEqual(["10:15"]);
    await db.exec(
      "UPDATE admin.vendor_schedules SET is_closed=true WHERE vendor_id='vendor' AND day_of_week='SUNDAY'",
    );
    await expect(
      db.query(
        "SELECT * FROM admin.reserve_purchase('flex','vendor','flex','2033-01-01','08:00',7)",
      ),
    ).rejects.toThrow(/closed day/);
  });

  it("extends a current paid stay on the same seat only after checking the following time window", async () => {
    await db.exec(`
      INSERT INTO admin.vendors(id,name,slug,phone,category_id,partner_id,status,created_by,time_zone,updated_at)
      VALUES('extension-vendor','Extension Library','extension-library','8888888888','library','partner','PUBLISHED','staff','UTC',now());
      INSERT INTO admin.library_seat_types(id,vendor_id,name,total_count) VALUES('extension-seat','extension-vendor','Standard',1);
      INSERT INTO admin.vendor_schedules(id,vendor_id,day_of_week,open_time,close_time,is_closed)
      SELECT 'extension-'||d,'extension-vendor',d::admin."DayOfWeek",date_trunc('minute',now()-interval '12 hours')::time,date_trunc('minute',now()-interval '12 hours')::time,false FROM unnest(ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']) d;
      INSERT INTO admin.membership_plans(id,vendor_id,name,price,duration_value,duration_unit,daily_hours,is_flexible,updated_at)
      VALUES('extension-rate','extension-vendor','Hourly extension',10,1,'HOURS',2,true,now());
      INSERT INTO admin.bookings(id,user_id,vendor_id,seat_id,start_at,end_at,booking_date,amount,status,booking_code,updated_at)
      SELECT 'original','11111111-1111-4111-8111-111111111111','extension-vendor',id,now()-interval '1 hour',now()+interval '1 hour',current_date,100,'CONFIRMED','ORIGINAL',now() FROM admin.library_seats WHERE vendor_id='extension-vendor';
      INSERT INTO admin.payment_orders(id,user_id,vendor_id,target_type,target_id,amount_paise,status,idempotency_key,request_hash,starts_at,expires_at,captured_at,updated_at)
      VALUES('original-order','11111111-1111-4111-8111-111111111111','extension-vendor','visit','original',10000,'CAPTURED','original-key','hash',now()-interval '1 hour',now()-interval '2 hours',now()-interval '2 hours',now());
      INSERT INTO admin.bookings(id,user_id,vendor_id,seat_id,start_at,end_at,booking_date,amount,status,booking_code,updated_at)
      SELECT 'next-booking','other','extension-vendor',id,now()+interval '90 minutes',now()+interval '150 minutes',current_date,100,'CONFIRMED','NEXT',now() FROM admin.library_seats WHERE vendor_id='extension-vendor';
    `);
    await expect(
      db.query(
        "SELECT * FROM admin.reserve_extension('original','extension-rate',1)",
      ),
    ).rejects.toThrow(/reserved after/);
    await db.exec(
      "UPDATE admin.bookings SET status='CANCELLED' WHERE id='next-booking'",
    );
    const result = await db.query<{ amount_paise: number }>(
      "SELECT * FROM admin.reserve_extension('original','extension-rate',1)",
    );
    expect(result.rows[0].amount_paise).toBe(1600);
    expect(
      (
        await db.query(
          "SELECT id FROM admin.flex_bookings WHERE parent_id='original'",
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      db.query(
        "SELECT * FROM admin.reserve_extension('original','extension-rate',1)",
      ),
    ).rejects.toThrow(/reserved after/);
  });
});
