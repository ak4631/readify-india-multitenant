import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { launchDatabase } from "../helpers/launch-database";
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
describe("Customer launch improvements", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await launchDatabase();
    await db.exec(`
      INSERT INTO public.profiles(id,full_name) VALUES('${user}','Customer'),('${other}','Other');
      INSERT INTO admin.users(id,name,email,password_hash,updated_at) VALUES('staff','Staff','staff@test.invalid','hash',now());
      INSERT INTO admin.partners(id,name,created_by,updated_at) VALUES('partner','Partner','staff',now());
      INSERT INTO admin.vendor_categories(id,name,slug,launch_enabled,updated_at) VALUES('library','Library','library',true,now());
      INSERT INTO admin.vendors(id,name,slug,phone,category_id,partner_id,status,created_by,updated_at)
      VALUES('vendor','Library','library','9999999999','library','partner','PUBLISHED','staff',now());
      INSERT INTO admin.library_seat_types(id,vendor_id,name,total_count) VALUES('type','vendor','Standard',1);
      INSERT INTO admin.vendor_schedules(id,vendor_id,day_of_week,open_time,close_time,is_closed)
      SELECT 'schedule-'||d,'vendor',d::admin."DayOfWeek",'00:00','00:00',false FROM unnest(ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']) d;
      INSERT INTO admin.membership_plans(id,vendor_id,name,price,duration_value,duration_unit,daily_hours,is_flexible,updated_at)
      VALUES('flex','vendor','Flex',10,1,'HOURS',4,true,now());
      SELECT set_config('request.jwt.claim.sub','${user}',false);
      INSERT INTO public.user_locations(user_id,latitude,longitude,address) VALUES('${user}',28.61,77.20,'Connaught Place, New Delhi, Delhi, India');
      GRANT USAGE ON SCHEMA public,auth TO authenticated;
    `);
  }, 60000);
  afterAll(async () => {
    if (db) await db.close();
  });
  it("offers every requested duration and prices the selected hours over all 14 days", async () => {
    for (const hours of [4, 6, 8, 12, 16, 18, 24]) {
      const options = await db.query(
        `SELECT * FROM public.get_purchase_options('vendor','flex','2035-01-01',14,$1)`,
        [hours],
      );
      expect(options.rows.length).toBeGreaterThan(0);
    }
    const result = await db.query<{ amount_paise: number; target_id: string }>(
      `SELECT * FROM admin.reserve_purchase('flex','vendor','flex','2035-01-01','00:00',14,24)`,
    );
    expect(result.rows[0].amount_paise).toBe((10 * 24 * 14 + 6) * 100);
    const count = await db.query<{ n: number }>(
      `SELECT count(*)::int n FROM admin.seat_reservations WHERE source_id=$1`,
      [result.rows[0].target_id],
    );
    expect(count.rows[0].n).toBe(14);
  });
  it("rejects overlapping hours and releases availability on cancellation", async () => {
    expect(
      (
        await db.query<{ seats_available: number }>(
          `SELECT * FROM public.get_purchase_options('vendor','flex','2035-01-02',1,4)`,
        )
      ).rows.every((r) => r.seats_available === 0),
    ).toBe(true);
    await expect(
      db.query(
        `SELECT * FROM admin.reserve_purchase('flex','vendor','flex','2035-01-02','08:00',1,4)`,
      ),
    ).rejects.toThrow(/No seat/);
    await db.exec(`UPDATE admin.flex_bookings SET status='CANCELLED'`);
    const options = await db.query<{ seats_available: number }>(
      `SELECT * FROM public.get_purchase_options('vendor','flex','2035-01-02',1,4)`,
    );
    expect(options.rows.some((r) => r.seats_available === 1)).toBe(true);
  });
  it("rejects unsupported hours and spans and windows outside opening hours", async () => {
    await expect(
      db.query(
        `SELECT * FROM admin.reserve_purchase('flex','vendor','flex','2035-03-01','00:00',1,5)`,
      ),
    ).rejects.toThrow(/daily hours/);
    await expect(
      db.query(
        `SELECT * FROM admin.reserve_purchase('flex','vendor','flex','2035-03-01','00:00',15,4)`,
      ),
    ).rejects.toThrow(/1-14/);
    await db.exec(
      `UPDATE admin.vendor_schedules SET open_time='06:00',close_time='22:00'`,
    );
    expect(
      (
        await db.query(
          `SELECT * FROM public.get_purchase_options('vendor','flex','2035-03-01',1,18)`,
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        `SELECT * FROM admin.reserve_purchase('flex','vendor','flex','2035-03-01','06:00',1,18)`,
      ),
    ).rejects.toThrow(/outside opening hours/);
  });
  it("queues each paid daily reminder once, excludes unpaid and cancelled bookings", async () => {
    await db.query(
      `SELECT public.register_customer_push_token('booking-reminder-device-token')`,
    );
    const reserved = await db.query<{ target_id: string; starts_at: Date }>(
      `SELECT * FROM admin.reserve_purchase('flex','vendor','flex','2035-04-01','08:00',2,6)`,
    );
    const id = reserved.rows[0].target_id;
    await db.query(
      `INSERT INTO admin.payment_orders(id,user_id,vendor_id,target_type,target_id,amount_paise,status,idempotency_key,request_hash,starts_at,expires_at,updated_at) VALUES('payment',$1,'vendor','flex',$2,12600,'CAPTURED','key','hash',$3,'2035-04-01',now())`,
      [user, id, reserved.rows[0].starts_at],
    );
    await db.query(
      `SELECT admin.enqueue_booking_reminders($1::timestamptz-interval '1 hour')`,
      [reserved.rows[0].starts_at],
    );
    await db.query(
      `SELECT admin.enqueue_booking_reminders($1::timestamptz-interval '1 hour')`,
      [reserved.rows[0].starts_at],
    );
    expect(
      (
        await db.query<{ n: number }>(
          `SELECT count(*)::int n FROM admin.customer_notifications`,
        )
      ).rows[0].n,
    ).toBe(1);
    const deliveries = await db.query<{ expires_at: Date }>(
      `SELECT expires_at FROM admin.customer_push_deliveries`,
    );
    expect(deliveries.rows).toHaveLength(1);
    expect(new Date(deliveries.rows[0].expires_at).getTime()).toBe(
      new Date(reserved.rows[0].starts_at).getTime(),
    );
    await db.query(
      `SELECT admin.enqueue_booking_reminders($1::timestamptz+interval '23 hours')`,
      [reserved.rows[0].starts_at],
    );
    expect(
      (
        await db.query<{ n: number }>(
          `SELECT count(*)::int n FROM admin.customer_notifications`,
        )
      ).rows[0].n,
    ).toBe(2);
    await db.exec(
      `UPDATE admin.flex_bookings SET status='CANCELLED' WHERE id='${id}'`,
    );
    expect(
      (
        await db.query<{ n: number }>(
          `SELECT admin.enqueue_booking_reminders($1::timestamptz-interval '1 hour') AS n`,
          [reserved.rows[0].starts_at],
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("filters banners by city, area, schedule, active state, and radius", async () => {
    await db.exec(`INSERT INTO admin.promotional_banners(id,title,image_url,external_id,destination_url,target_city,target_area,starts_at,ends_at,is_active,sort_order)
      VALUES('global','Global','https://example.test/a.png','1','https://example.test',NULL,NULL,now()-interval '1 day',now()+interval '1 day',true,0),
      ('local','Local','https://example.test/a.png','2','https://example.test','New Delhi','Connaught Place',now()-interval '1 day',now()+interval '1 day',true,1),
      ('other','Other','https://example.test/a.png','3','https://example.test','Mumbai',NULL,now()-interval '1 day',now()+interval '1 day',true,2),
      ('inactive','Inactive','https://example.test/a.png','4','https://example.test',NULL,NULL,now()-interval '1 day',now()+interval '1 day',false,3),
      ('future','Future','https://example.test/a.png','5','https://example.test',NULL,NULL,now()+interval '1 day',now()+interval '2 days',true,4),
      ('expired','Expired','https://example.test/a.png','6','https://example.test',NULL,NULL,now()-interval '2 days',now()-interval '1 day',true,5);`);
    const ids = async (use = true) =>
      (
        await db.query<{ id: string }>(
          `SELECT * FROM public.get_promotional_banners($1)`,
          [use],
        )
      ).rows.map((b) => b.id);
    expect(await ids()).toEqual(["global", "local"]);
    expect(await ids(false)).toEqual(["global"]);
    await db.exec(
      `UPDATE admin.promotional_banners SET latitude=19.07,longitude=72.87,radius_km=10 WHERE id='local'`,
    );
    expect(await ids()).toEqual(["global"]);
    await db.exec(
      `UPDATE admin.promotional_banners SET latitude=28.61,longitude=77.20 WHERE id='local'`,
    );
    expect(await ids()).toEqual(["global", "local"]);
  });
  it("caps the carousel at four and hides unpublished listing destinations", async () => {
    await db.exec(`INSERT INTO admin.promotional_banners(id,title,image_url,external_id,vendor_id,starts_at,ends_at,sort_order)
      VALUES('listing','Listing','https://example.test/a.png','7','vendor',now()-interval '1 day',now()+interval '1 day',2);
      INSERT INTO admin.promotional_banners(id,title,image_url,external_id,destination_url,starts_at,ends_at,sort_order)
      SELECT 'extra'||i,'Extra','https://example.test/a.png','ext'||i,'https://example.test',now()-interval '1 day',now()+interval '1 day',10+i FROM generate_series(1,4)i;`);
    expect(
      (await db.query(`SELECT * FROM public.get_promotional_banners()`)).rows,
    ).toHaveLength(4);
    await db.exec(
      `UPDATE admin.vendors SET status='SUSPENDED' WHERE id='vendor'`,
    );
    expect(
      (
        await db.query<{ id: string }>(
          `SELECT * FROM public.get_promotional_banners()`,
        )
      ).rows.some((b) => b.id === "listing"),
    ).toBe(false);
  });
  it("isolates wishlist rows and support tickets between customer accounts", async () => {
    await db.exec(
      `SET ROLE authenticated; INSERT INTO public.customer_wishlist(user_id,vendor_id) VALUES('${user}','vendor');`,
    );
    await expect(
      db.exec(
        `INSERT INTO public.customer_wishlist(user_id,vendor_id) VALUES('${other}','vendor')`,
      ),
    ).rejects.toThrow(/row-level security/);
    await db.query(
      `SELECT public.create_customer_support_ticket('Booking help','Please help with my booking reference.')`,
    );
    expect(
      (await db.query(`SELECT * FROM public.customer_support_tickets`)).rows,
    ).toHaveLength(1);
    await db.exec(
      `SELECT set_config('request.jwt.claim.sub','${other}',false)`,
    );
    expect(
      (await db.query(`SELECT * FROM public.customer_wishlist`)).rows,
    ).toHaveLength(0);
    expect(
      (await db.query(`SELECT * FROM public.customer_support_tickets`)).rows,
    ).toHaveLength(0);
    await expect(
      db.query(`SELECT * FROM admin.promotional_banners`),
    ).rejects.toThrow(/permission denied/);
    await db.exec(
      `RESET ROLE; SELECT set_config('request.jwt.claim.sub','${user}',false)`,
    );
  });
});
