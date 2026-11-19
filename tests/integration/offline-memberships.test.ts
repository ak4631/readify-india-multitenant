import type { MembershipCardDetails } from "@/lib/membership-cards";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { launchDatabase } from "../helpers/launch-database";
const customer = "11111111-1111-4111-8111-111111111111";
describe("offline membership database contracts", () => {
  let db: PGlite;
  let target: string;
  beforeAll(async () => {
    db = await launchDatabase();
    await db.exec(`
   INSERT INTO public.profiles(id,full_name) VALUES('${customer}','Verified Customer');
   INSERT INTO admin.users(id,name,email,password_hash,updated_at) VALUES('staff','Partner Staff','staff@test.invalid','hash',now());
   INSERT INTO admin.partners(id,name,created_by,updated_at) VALUES('partner','Partner','staff',now());
   INSERT INTO admin.vendor_categories(id,name,slug,launch_enabled,updated_at) VALUES('library','Library','library',true,now());
   INSERT INTO admin.vendors(id,name,slug,phone,category_id,partner_id,status,created_by,updated_at) VALUES('vendor','Test Library','test-library','9999999999','library','partner','PUBLISHED','staff',now());
   INSERT INTO admin.library_seat_types(id,vendor_id,name,total_count) VALUES('type','vendor','Standard',1);
   INSERT INTO admin.vendor_schedules(id,vendor_id,day_of_week,open_time,close_time,is_closed)
   SELECT 'schedule-'||d,'vendor',d::admin."DayOfWeek",'06:00','22:00',false FROM unnest(ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']) d;
   INSERT INTO admin.membership_plans(id,vendor_id,name,price,duration_value,duration_unit,daily_hours,daily_start,updated_at) VALUES('monthly','vendor','Monthly',1000,1,'MONTHS',4,'10:00',now());
   SELECT set_config('request.jwt.claim.sub','${customer}',false);
  `);
    const result = await db.query<{ target_id: string }>(
      `SELECT * FROM admin.reserve_purchase('subscription','vendor','monthly','2035-01-01',NULL,NULL,NULL)`,
    );
    target = result.rows[0].target_id;
    await db.query(
      `INSERT INTO admin.payment_orders(id,user_id,vendor_id,target_type,target_id,amount_paise,idempotency_key,request_hash,starts_at,expires_at,updated_at,payment_method,verification_required) VALUES('order',$1,'vendor','subscription',$2,100600,'retry','hash','2035-01-01','2035-01-02',now(),'OFFLINE',true)`,
      [customer, target],
    );
  }, 60000);
  afterAll(async () => {
    await db?.close();
  });
  it("prevents disabling both payment options", async () => {
    await expect(
      db.exec(
        `UPDATE admin.payment_settings SET online_enabled=false,offline_enabled=false`,
      ),
    ).rejects.toThrow(/check constraint/i);
  });
  it("does not generate cards for unpaid reservations", async () => {
    expect(
      (await db.query(`SELECT * FROM admin.membership_card_details`)).rows,
    ).toHaveLength(0);
  });
  it("retains payment and QR compatibility while exposing the offline deadline only to its owner", async () => {
    const result = await db.query<{
      payment_method: string;
      verification_required: boolean;
    }>(
      `SELECT payment_method,verification_required FROM public.customer_payment_orders`,
    );
    expect(result.rows[0]).toEqual({
      payment_method: "OFFLINE",
      verification_required: true,
    });
    await db.exec(`SET ROLE authenticated`);
    await expect(
      db.query("SELECT photo_path FROM admin.membership_cards"),
    ).rejects.toThrow(/permission denied/);
    await db.exec(
      `RESET ROLE; SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false)`,
    );
    expect(
      (await db.query("SELECT * FROM public.customer_payment_orders")).rows,
    ).toHaveLength(0);
    await db.exec(
      `SELECT set_config('request.jwt.claim.sub','${customer}',false)`,
    );
  });
  it("rolls back a late-payment date shift when the new dates overlap another reservation", async () => {
    await db.exec(
      `INSERT INTO admin.membership_plans(id,vendor_id,name,price,duration_value,duration_unit,daily_hours,is_flexible,updated_at) VALUES('flex','vendor','Flex',10,1,'HOURS',4,true,now())`,
    );
    const competing = await db.query<{ target_id: string }>(
      `SELECT * FROM admin.reserve_purchase('flex','vendor','flex','2035-02-02','10:00',1,4)`,
    );
    await expect(
      db.query(
        `UPDATE admin.subscriptions SET start_date='2035-01-03',end_date='2035-02-03' WHERE id=$1`,
        [target],
      ),
    ).rejects.toThrow(/overlap|conflict/i);
    const result = await db.query<{ service_day: string }>(
      `SELECT start_date::date::text service_day FROM admin.subscriptions WHERE id=$1`,
      [target],
    );
    expect(result.rows[0].service_day).toBe("2035-01-01");
    await db.query(
      `UPDATE admin.flex_bookings SET status='CANCELLED' WHERE id=$1`,
      [competing.rows[0].target_id],
    );
  });
  it("rebuilds seat windows atomically when late payment moves the subscription start", async () => {
    await db.query(
      `UPDATE admin.subscriptions SET end_date='2035-01-03'::date+age(end_date,start_date), start_date='2035-01-03',status='ACTIVE' WHERE id=$1`,
      [target],
    );
    const dates = await db.query<{ first: string; last: string }>(
      `SELECT start_date::date::text first,end_date::date::text last FROM admin.subscriptions WHERE id=$1`,
      [target],
    );
    expect(dates.rows[0]).toEqual({ first: "2035-01-03", last: "2035-02-03" });
    const count = await db.query<{ n: number }>(
      `SELECT count(*)::int n FROM admin.seat_reservations WHERE source_id=$1`,
      [target],
    );
    expect(count.rows[0].n).toBe(31);
  });
  it("validates real access windows against changed opening hours", async () => {
    expect(
      (
        await db.query<{ valid: boolean }>(
          `SELECT admin.membership_windows_valid($1,'vendor') valid`,
          [target],
        )
      ).rows[0].valid,
    ).toBe(true);
    await db.exec(`UPDATE admin.vendor_schedules SET close_time='12:00'`);
    expect(
      (
        await db.query<{ valid: boolean }>(
          `SELECT admin.membership_windows_valid($1,'vendor') valid`,
          [target],
        )
      ).rows[0].valid,
    ).toBe(false);
    await db.exec(`UPDATE admin.vendor_schedules SET close_time='22:00'`);
  });
  it("projects the verified card with an inclusive final day and the original subscription QR", async () => {
    await db.exec(
      `UPDATE admin.payment_orders SET status='CAPTURED',captured_at=now() WHERE id='order'; INSERT INTO admin.membership_cards(id,order_id,customer_name,photo_path,verified_by) VALUES('ZT-MEMBER','order','Verified Customer','/private/selfie','staff')`,
    );
    const card = (
      await db.query<MembershipCardDetails>(
        `SELECT * FROM admin.membership_card_details`,
      )
    ).rows[0];
    expect(card.customer_name).toBe("Verified Customer");
    expect(card.vendor_name).toBe("Test Library");
    expect(card.qr_value).toBe(`subscription:${target}`);
    expect(card.status).toBe("SCHEDULED");
    expect(card.valid_until.toISOString().slice(0, 10)).toBe("2035-02-02");
    await expect(
      db.exec(
        `INSERT INTO admin.membership_cards(id,order_id,customer_name,photo_path,verified_by) VALUES('duplicate','order','Other','/another','staff')`,
      ),
    ).rejects.toThrow(/unique/i);
  });
  it("reports expiry from the first day after the inclusive final day, and cancellation immediately", async () => {
    await db.query(
      `UPDATE admin.subscriptions SET start_date=(now() AT TIME ZONE 'Asia/Kolkata')::date-2,end_date=(now() AT TIME ZONE 'Asia/Kolkata')::date+1 WHERE id=$1`,
      [target],
    );
    expect(
      (
        await db.query<{ status: string }>(
          `SELECT status FROM admin.membership_card_details`,
        )
      ).rows[0].status,
    ).toBe("ACTIVE");
    await db.query(
      `UPDATE admin.subscriptions SET end_date=(now() AT TIME ZONE 'Asia/Kolkata')::date WHERE id=$1`,
      [target],
    );
    expect(
      (
        await db.query<{ status: string }>(
          `SELECT status FROM admin.membership_card_details`,
        )
      ).rows[0].status,
    ).toBe("EXPIRED");
    await db.exec(
      `UPDATE admin.payment_orders SET status='CANCELLED' WHERE id='order'`,
    );
    expect(
      (
        await db.query<{ status: string }>(
          `SELECT status FROM admin.membership_card_details`,
        )
      ).rows[0].status,
    ).toBe("CANCELLED");
  });
});
