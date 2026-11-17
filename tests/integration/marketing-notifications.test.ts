import { beforeAll, afterAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { launchDatabase } from "../helpers/launch-database";
let db: PGlite;
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  inactive = "33333333-3333-4333-8333-333333333333";
beforeAll(async () => {
  db = await launchDatabase();
  await db.exec(`INSERT INTO public.profiles(id,full_name) VALUES('${a}','A'),('${b}','B'),('${inactive}','Inactive');
    UPDATE public.profiles SET is_active=false WHERE id='${inactive}';
    INSERT INTO public.user_locations(user_id,latitude,longitude,address) VALUES('${a}',28.6,77.2,'Connaught Place, New Delhi, India'),('${b}',19,72,'Bandra, Mumbai, India');
    INSERT INTO admin.customer_push_tokens(token,user_id) VALUES('marketing-push-test-token','${a}');
    GRANT USAGE ON SCHEMA public,auth TO authenticated;`);
}, 60000);
afterAll(async () => {
  if (db) await db.close();
});
async function campaign(
  id: string,
  city: string | null = null,
  area: string | null = null,
  service: string | null = null,
  scheduled = "now()",
) {
  await db.query(
    `INSERT INTO admin.marketing_campaigns(id,title,body,image_url,destination_url,target_city,target_area,target_service,scheduled_at,created_by)
    VALUES($1,'Offer','Save today','https://example.test/image.png','https://example.test/offer',$2,$3,$4,${scheduled},'staff')`,
    [id, city, area, service],
  );
}
it("combines location filters, excludes inactive customers and queues images and links exactly once", async () => {
  await campaign("local", "new delhi", "connaught place");
  expect(
    (
      await db.query<{ n: number }>(
        `SELECT admin.enqueue_marketing_campaigns() n`,
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (
      await db.query<{ n: number }>(
        `SELECT admin.enqueue_marketing_campaigns() n`,
      )
    ).rows[0].n,
  ).toBe(0);
  const rows = (
    await db.query<{
      user_id: string;
      image_url: string;
      destination_url: string;
    }>(`SELECT * FROM admin.customer_notifications`)
  ).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0].user_id).toBe(a);
  expect(rows[0].image_url).toBe("https://example.test/image.png");
  expect(rows[0].destination_url).toBe("https://example.test/offer");
  expect(
    (await db.query(`SELECT * FROM admin.customer_push_deliveries`)).rows,
  ).toHaveLength(1);
});
it("waits for schedules and skips cancelled campaigns; a global campaign reaches both active customers", async () => {
  await campaign("future", null, null, null, "now()+interval '1 day'");
  await campaign("cancelled");
  await db.exec(
    `UPDATE admin.marketing_campaigns SET status='CANCELLED' WHERE id='cancelled'`,
  );
  await campaign("global");
  expect(
    (
      await db.query<{ n: number }>(
        `SELECT admin.enqueue_marketing_campaigns() n`,
      )
    ).rows[0].n,
  ).toBe(2);
  expect(
    (
      await db.query<{ status: string }>(
        `SELECT status FROM admin.marketing_campaigns WHERE id='future'`,
      )
    ).rows[0].status,
  ).toBe("SCHEDULED");
});
it("service filter requires a captured purchase in the selected category", async () => {
  await db.exec(`INSERT INTO admin.users(id,name,email,password_hash,updated_at) VALUES('staff','Staff','marketing@test.invalid','hash',now());
    INSERT INTO admin.partners(id,name,created_by,updated_at) VALUES('partner','Partner','staff',now());
    INSERT INTO admin.vendor_categories(id,name,slug,updated_at) VALUES('library','Library','library',now());
    INSERT INTO admin.vendors(id,name,slug,phone,category_id,partner_id,created_by,updated_at) VALUES('vendor','Library','library','9999999999','library','partner','staff',now());
    INSERT INTO admin.payment_orders(id,user_id,vendor_id,target_type,target_id,amount_paise,status,idempotency_key,request_hash,starts_at,expires_at,updated_at)
    VALUES('paid','${a}','vendor','flex','purchase',100,'CAPTURED','paid','hash',now(),now(),now()),('unpaid','${b}','vendor','flex','other',100,'CREATED','unpaid','hash',now(),now(),now());`);
  await campaign("service", null, null, "library");
  expect(
    (
      await db.query<{ n: number }>(
        `SELECT admin.enqueue_marketing_campaigns() n`,
      )
    ).rows[0].n,
  ).toBe(1);
});
it("customers cannot read campaigns or invoke the worker and can only read their own inbox", async () => {
  await db.exec(
    `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${b}',false)`,
  );
  await expect(
    db.query(`SELECT * FROM admin.marketing_campaigns`),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.query(`SELECT admin.enqueue_marketing_campaigns()`),
  ).rejects.toThrow(/permission denied/);
  const rows = (await db.query(`SELECT * FROM public.customer_notifications`))
    .rows;
  expect(rows).toHaveLength(1);
  await db.exec(`RESET ROLE`);
});

it("queues a broadcast with no destination once, including active profiles without purchases or locations", async () => {
  await db.exec(`INSERT INTO public.profiles(id,full_name,role) VALUES('44444444-4444-4444-8444-444444444444','New customer','customer');
    INSERT INTO admin.marketing_campaigns(id,title,body,scheduled_at,created_by) VALUES('no-link','Announcement','For everyone',now(),'staff'),('other-due','Other','Pending',now(),'staff');`);
  const audience = await db.query(`SELECT * FROM admin.marketing_audience()`);
  expect(audience.rows).toHaveLength(3);
  expect(
    (
      await db.query<{ n: number }>(
        `SELECT admin.enqueue_marketing_campaign('no-link') n`,
      )
    ).rows[0].n,
  ).toBe(3);
  expect(
    (
      await db.query<{ n: number }>(
        `SELECT admin.enqueue_marketing_campaign('no-link') n`,
      )
    ).rows[0].n,
  ).toBe(0);
  const records = await db.query<{
    vendor_id: string | null;
    destination_url: string | null;
    service_category: string | null;
  }>(
    `SELECT * FROM admin.customer_notifications WHERE event_key LIKE 'marketing:no-link:%'`,
  );
  expect(records.rows).toHaveLength(3);
  expect(
    records.rows.every(
      (n) =>
        n.vendor_id === null &&
        n.destination_url === null &&
        n.service_category === null,
    ),
  ).toBe(true);
  expect(
    (
      await db.query<{ status: string }>(
        `SELECT status FROM admin.marketing_campaigns WHERE id='other-due'`,
      )
    ).rows[0].status,
  ).toBe("SCHEDULED");
  expect(
    (
      await db.query<{ status: string }>(
        `SELECT status FROM admin.marketing_campaigns WHERE id='no-link'`,
      )
    ).rows[0].status,
  ).toBe("QUEUED");
});
it("the single-campaign entry point respects future schedules and customer authorization", async () => {
  expect(
    (
      await db.query<{ n: number }>(
        `SELECT admin.enqueue_marketing_campaign('future') n`,
      )
    ).rows[0].n,
  ).toBe(0);
  await db.exec(`SET ROLE authenticated`);
  await expect(
    db.query(`SELECT * FROM admin.marketing_audience()`),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.query(`SELECT admin.enqueue_marketing_campaign('future')`),
  ).rejects.toThrow(/permission denied/);
  await db.exec(`RESET ROLE`);
});
