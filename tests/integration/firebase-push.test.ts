import { beforeAll, afterAll, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { launchDatabase } from "../helpers/launch-database";
let db: PGlite;
const first = "11111111-1111-4111-8111-111111111111",
  second = "22222222-2222-4222-8222-222222222222";
const token = "test-firebase-registration-token";
beforeAll(async () => {
  db = await launchDatabase();
  await db.exec(`INSERT INTO public.profiles(id,full_name) VALUES('${first}','First'),('${second}','Second');
    SELECT set_config('request.jwt.claim.sub','${first}',false); GRANT USAGE ON SCHEMA public,auth TO authenticated;`);
}, 60000);
afterAll(async () => {
  if (db) await db.close();
});
it("registers idempotently and queues only new notifications for the owning customer", async () => {
  await db.query(`SELECT public.register_customer_push_token($1)`, [token]);
  await db.query(`SELECT public.register_customer_push_token($1)`, [token]);
  expect(
    (await db.query(`SELECT * FROM admin.customer_push_tokens`)).rows,
  ).toHaveLength(1);
  await db.exec(`INSERT INTO admin.customer_notifications(id,user_id,event_key,title,body)
    VALUES('one','${first}','event-one','First','Body'),('two','${second}','event-two','Second','Body');`);
  const jobs = await db.query<{ notification_id: string }>(
    `SELECT * FROM admin.customer_push_deliveries`,
  );
  expect(jobs.rows.map((j) => j.notification_id)).toEqual(["one"]);
});
it("account changes remove old queued deliveries for a reused device token", async () => {
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${second}',false)`);
  await db.query(`SELECT public.register_customer_push_token($1)`, [token]);
  expect(
    (await db.query(`SELECT * FROM admin.customer_push_deliveries`)).rows,
  ).toHaveLength(0);
  expect(
    (
      await db.query<{ user_id: string }>(
        `SELECT user_id FROM admin.customer_push_tokens`,
      )
    ).rows[0].user_id,
  ).toBe(second);
});
it("customers cannot list tokens, revoke another account token or register malformed tokens", async () => {
  await db.exec(
    `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${first}',false)`,
  );
  await expect(
    db.query(`SELECT * FROM admin.customer_push_tokens`),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.query(`SELECT public.register_customer_push_token('bad')`),
  ).rejects.toThrow(/Invalid push token/);
  await db.query(`SELECT public.unregister_customer_push_token($1)`, [token]);
  await db.exec(`RESET ROLE`);
  expect(
    (await db.query(`SELECT * FROM admin.customer_push_tokens`)).rows,
  ).toHaveLength(1);
});
it("unregistering deletes delivery jobs and suspended profiles cannot register", async () => {
  await db.exec(
    `SELECT set_config('request.jwt.claim.sub','${second}',false); INSERT INTO admin.customer_notifications(id,user_id,event_key,title,body) VALUES('three','${second}','event-three','Test','Body')`,
  );
  expect(
    (await db.query(`SELECT * FROM admin.customer_push_deliveries`)).rows,
  ).toHaveLength(1);
  await db.query(`SELECT public.unregister_customer_push_token($1)`, [token]);
  expect(
    (await db.query(`SELECT * FROM admin.customer_push_deliveries`)).rows,
  ).toHaveLength(0);
  await db.exec(
    `UPDATE public.profiles SET is_active=false WHERE id='${second}'`,
  );
  await expect(
    db.query(`SELECT public.register_customer_push_token($1)`, [token]),
  ).rejects.toThrow(/Not authenticated/);
});
