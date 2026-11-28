import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { migrationSql } from "../../backend/database/migration-sql.mjs";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/imagekit", () => ({
  getSignedDocumentUrl: async (path: string) => `signed:${path}`,
}));
import { customerMembershipCards } from "@/lib/membership-cards";
const state = vi.hoisted(() => ({ db: null as PGlite | null }));
vi.mock("@/lib/prisma", () => {
  const raw = async (
    input: TemplateStringsArray | { text: string; values: unknown[] },
    ...values: unknown[]
  ) => {
    const sql =
      "text" in input
        ? input.text
        : input.reduce(
            (text, part, index) => text + (index ? `$${index}` : "") + part,
            "",
          );
    return (await state.db!.query(sql, "text" in input ? input.values : values))
      .rows;
  };
  const tx = { $queryRaw: raw, $executeRaw: raw };
  return {
    prisma: {
      $queryRaw: raw,
      $transaction: async (fn: (tx: unknown) => unknown) => {
        await state.db!.exec("BEGIN");
        try {
          const result = await fn(tx);
          await state.db!.exec("COMMIT");
          return result;
        } catch (error) {
          await state.db!.exec("ROLLBACK");
          throw error;
        }
      },
    },
  };
});
import {
  dataRequestSchema,
  readCustomerData,
  callCustomerRpc,
} from "@/lib/customer-data";
import {
  historyRequestSchema,
  readCustomerHistory,
} from "@/lib/customer-history";
import { listPartnerCustomerPage } from "@/lib/partner-customers";
import { pageWindow } from "@/lib/pagination";
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
describe("fresh independent PostgreSQL backend", () => {
  beforeAll(async () => {
    state.db = new PGlite({ extensions: { btree_gist } });
    await state.db.exec(readFileSync("backend/database/bootstrap.sql", "utf8"));
    for (const name of readdirSync("prisma/migrations")
      .filter((n) => /^\d{14}_/.test(n))
      .sort()) {
      await state.db.exec(
        migrationSql(
          name,
          readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"),
        ),
      );
    }
    await state.db.query(
      "INSERT INTO auth.users(id,email) VALUES($1,'alice@test.invalid'),($2,'bob@test.invalid')",
      [alice, bob],
    );
    await state.db.query(
      "INSERT INTO public.profiles(id,full_name) VALUES($1,'Alice'),($2,'Bob')",
      [alice, bob],
    );
    await state.db.exec(`
      INSERT INTO admin.users(id,name,email,password_hash,updated_at) VALUES('staff','Staff','staff@test.invalid','hash',now());
      INSERT INTO admin.partners(id,name,created_by,updated_at) VALUES('partner-a','A','staff',now()),('partner-b','B','staff',now());
      INSERT INTO admin.vendor_categories(id,name,slug,launch_enabled,updated_at) VALUES('library','Library','library',true,now());
      INSERT INTO admin.vendors(id,name,slug,phone,category_id,partner_id,status,created_by,updated_at)
        VALUES('vendor-a','Library A','library-a','123','library','partner-a','PUBLISHED','staff',now()),('vendor-b','Library B','library-b','123','library','partner-b','PUBLISHED','staff',now());
      INSERT INTO admin.membership_plans(id,vendor_id,name,price,duration_value,duration_unit,updated_at)
        VALUES('plan','vendor-a','Monthly',100,1,'MONTHS',now());
      INSERT INTO admin.library_seats(id,vendor_id,label) VALUES('seat','vendor-a','A1');
      INSERT INTO admin.bookings(id,user_id,vendor_id,booking_date,amount,status,created_at,updated_at)
        SELECT 'visit-'||n,'${alice}','vendor-a','2035-01-01',100,'CONFIRMED','2030-01-01'::timestamp+n*interval '1 minute',now() FROM generate_series(1,61) n;
      INSERT INTO admin.bookings(id,user_id,vendor_id,booking_date,amount,status,created_at,updated_at)
        VALUES('bob-visit','${bob}','vendor-a','2035-01-01',100,'CONFIRMED','2030-01-02',now()),('other-tenant','${alice}','vendor-b','2035-01-01',100,'CONFIRMED','2030-01-03',now());
      INSERT INTO admin.flex_bookings(id,user_id,vendor_id,plan_id,seat_id,start_date,days,slot_start,slot_hours,amount,booking_code,created_at,updated_at)
        VALUES('flex','${alice}','vendor-a','plan','seat','2035-01-01',1,'10:00',4,400,'FLEX','2030-01-04',now());
      INSERT INTO admin.subscriptions(id,user_id,vendor_id,plan_id,start_date,end_date,status,amount_paid,created_at,updated_at)
        VALUES('alice-sub','${alice}','vendor-a','plan','2035-01-01','2035-02-01','ACTIVE',100,'2030-01-04',now()),('bob-sub','${bob}','vendor-a','plan','2035-01-01','2035-02-01','ACTIVE',100,'2030-01-02',now());
      INSERT INTO admin.payment_orders(id,user_id,vendor_id,target_type,target_id,amount_paise,idempotency_key,request_hash,starts_at,expires_at,updated_at,status,captured_at,payment_method)
        VALUES('paid','${alice}','vendor-a','flex','flex',40000,'key','hash','2035-01-01','2035-01-02',now(),'CAPTURED',now(),'OFFLINE'),
        ('other-paid','${alice}','vendor-b','visit','other-tenant',90000,'other','hash','2035-01-01','2035-01-02',now(),'CAPTURED',now(),'ONLINE');
    `);
  }, 30_000);
  afterAll(async () => {
    await state.db?.close();
  });
  it("scopes reads to the verified customer even if another ID is requested", async () => {
    expect(
      await readCustomerData(
        dataRequestSchema.parse({
          table: "profiles",
          filters: [{ column: "id", op: "eq", value: bob }],
        }),
        alice,
      ),
    ).toEqual([]);
    const own = await readCustomerData(
      dataRequestSchema.parse({
        table: "profiles",
        columns: "id,full_name",
        single: "single",
      }),
      alice,
    );
    expect(own).toEqual({ id: alice, full_name: "Alice" });
  });
  it("keeps profile ownership, role and active status under server control", async () => {
    await readCustomerData(
      dataRequestSchema.parse({
        table: "profiles",
        action: "upsert",
        values: {
          id: bob,
          full_name: "Updated",
          role: "admin",
          is_active: false,
        },
      }),
      alice,
    );
    const result = await state.db!.query(
      "SELECT full_name,role,is_active FROM public.profiles WHERE id=$1",
      [alice],
    );
    expect(result.rows[0]).toEqual({
      full_name: "Updated",
      role: "user",
      is_active: true,
    });
    expect(
      (
        await state.db!.query(
          "SELECT full_name FROM public.profiles WHERE id=$1",
          [bob],
        )
      ).rows[0],
    ).toEqual({ full_name: "Bob" });
  });
  it("keeps authenticated SQL identity transaction-local and private views scoped", async () => {
    expect(
      await callCustomerRpc(
        "get_promotional_banners",
        { p_use_saved_location: false },
        null,
      ),
    ).toEqual([]);
    expect(
      await readCustomerData(
        dataRequestSchema.parse({ table: "customer_notifications" }),
        alice,
      ),
    ).toEqual([]);
    expect((await state.db!.query("SELECT auth.uid() AS id")).rows[0]).toEqual({
      id: null,
    });
  });
  it("uses verified identity for SQL writes and isolates notification reads", async () => {
    await callCustomerRpc(
      "create_customer_support_ticket",
      {
        p_subject: "Booking help",
        p_message: "Please help me check my booking.",
      },
      alice,
    );
    const tickets = await state.db!.query(
      "SELECT user_id::text FROM admin.customer_support_tickets",
    );
    expect(tickets.rows).toEqual([{ user_id: alice }]);
    await state.db!.query(
      "INSERT INTO admin.customer_notifications(id,user_id,event_key,title,body) VALUES('alice-note',$1,'alice-event','Alice','private'),('bob-note',$2,'bob-event','Bob','private')",
      [alice, bob],
    );
    expect(
      await readCustomerData(
        dataRequestSchema.parse({
          table: "customer_notifications",
          columns: "id",
        }),
        alice,
      ),
    ).toEqual([{ id: "alice-note" }]);
    await callCustomerRpc(
      "mark_customer_notification_read",
      { p_id: "bob-note" },
      alice,
    );
    expect(
      (
        await state.db!.query(
          "SELECT read_at FROM admin.customer_notifications WHERE id='bob-note'",
        )
      ).rows[0],
    ).toEqual({ read_at: null });
    expect(
      await callCustomerRpc(
        "nearby_vendors",
        { p_latitude: 23, p_longitude: 72, p_limit: 20 },
        alice,
      ),
    ).toEqual([]);
  });
  it("rejects unapproved tables, function names, arguments and unauthenticated private reads", async () => {
    expect(() => dataRequestSchema.parse({ table: "users" })).toThrow();
    await expect(
      readCustomerData(dataRequestSchema.parse({ table: "profiles" }), null),
    ).rejects.toThrow("Not authenticated");
    await expect(
      readCustomerData(
        dataRequestSchema.parse({
          table: "published_listings",
          columns: "id);DROP TABLE auth.users;--",
        }),
        null,
      ),
    ).rejects.toThrow();
    await expect(
      callCustomerRpc("reserve_purchase", {}, alice),
    ).rejects.toThrow("Unknown operation");
    await expect(
      callCustomerRpc("nearby_vendors", { injected: "x" }, null),
    ).rejects.toThrow("Unknown argument");
  });
  it("paginates combined history before joining only the customer's payment metadata", async () => {
    const first = (await readCustomerHistory(
      alice,
      historyRequestSchema.parse({ kind: "bookings", limit: 2 }),
    )) as {
      id: string;
      payment_status: string;
      kind: string;
      payment_method: string;
    }[];
    expect(first.map((row) => row.id)).toEqual(["flex", "other-tenant"]);
    expect(first[0]).toMatchObject({
      kind: "flex",
      payment_status: "CAPTURED",
      payment_method: "OFFLINE",
    });
    const second = (await readCustomerHistory(
      alice,
      historyRequestSchema.parse({ kind: "bookings", limit: 2, offset: 2 }),
    )) as { id: string }[];
    expect(second.map((row) => row.id)).toEqual(["visit-61", "visit-60"]);
    expect(
      (
        (await readCustomerHistory(
          bob,
          historyRequestSchema.parse({ kind: "bookings" }),
        )) as { id: string }[]
      ).map((row) => row.id),
    ).toEqual(["bob-visit"]);
    expect((await state.db!.query("SELECT auth.uid() AS id")).rows[0]).toEqual({
      id: null,
    });
  });
  it("bounds history requests and filters active subscriptions on the server", async () => {
    expect(() =>
      historyRequestSchema.parse({ kind: "bookings", limit: 501 }),
    ).toThrow();
    expect(() =>
      historyRequestSchema.parse({ kind: "bookings", offset: -1 }),
    ).toThrow();
    const input = historyRequestSchema.parse({
      kind: "subscriptions",
      vendorId: "vendor-a",
      status: "active",
      limit: 1,
    });
    expect(
      ((await readCustomerHistory(alice, input)) as { id: string }[]).map(
        (row) => row.id,
      ),
    ).toEqual(["alice-sub"]);
    expect(
      await readCustomerHistory(alice, { ...input, vendorId: "vendor-b" }),
    ).toEqual([]);
  });
  it("paginates partner aggregates in SQL and keeps totals, filters and spend tenant-scoped", async () => {
    const page = await listPartnerCustomerPage(
      "partner-a",
      "all",
      new Date("2030-01-05Z"),
      pageWindow(1, 1),
    );
    expect(page.total).toBe(2);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: alice,
      totalBookings: 62,
      activeSubscriptions: 1,
      flexibleBookings: 1,
      totalSpent: 400,
    });
    expect(page.items[0].joinedAt).toEqual(new Date("2030-01-01T00:01:00Z"));
    const second = await listPartnerCustomerPage(
      "partner-a",
      "all",
      new Date(),
      pageWindow(2, 1),
    );
    expect(second.items[0].id).toBe(bob);
    const beyond = await listPartnerCustomerPage(
      "partner-a",
      "all",
      new Date(),
      pageWindow(20, 1),
    );
    expect(beyond).toMatchObject({ total: 2, items: [] });
    expect(
      (
        await listPartnerCustomerPage(
          "partner-a",
          "flexible",
          new Date(),
          pageWindow(1),
        )
      ).items.map((row) => row.id),
    ).toEqual([alice]);
    expect(
      (
        await listPartnerCustomerPage(
          "partner-a",
          "active",
          new Date(),
          pageWindow(1),
        )
      ).total,
    ).toBe(0);
    expect(
      (
        await listPartnerCustomerPage(
          "partner-b",
          "all",
          new Date(),
          pageWindow(1),
        )
      ).items[0],
    ).toMatchObject({ totalBookings: 1, totalSpent: 900 });
  });
  it("filters booking tabs before pagination so completed rows cannot hide upcoming visits", async () => {
    await state.db!.exec(
      "UPDATE admin.bookings SET booking_date='2000-01-01' WHERE id IN ('visit-1','visit-2'); UPDATE admin.bookings SET status='CANCELLED' WHERE id='visit-2'",
    );
    const completed = (await readCustomerHistory(
      alice,
      historyRequestSchema.parse({
        kind: "bookings",
        bucket: "completed",
        limit: 1,
      }),
    )) as { id: string }[];
    expect(completed.map((row) => row.id)).toEqual(["visit-1"]);
    const cancelled = (await readCustomerHistory(
      alice,
      historyRequestSchema.parse({
        kind: "bookings",
        bucket: "cancelled",
        limit: 1,
      }),
    )) as { id: string }[];
    expect(cancelled.map((row) => row.id)).toEqual(["visit-2"]);
    const upcoming = (await readCustomerHistory(
      alice,
      historyRequestSchema.parse({
        kind: "bookings",
        bucket: "upcoming",
        limit: 100,
      }),
    )) as { id: string }[];
    expect(upcoming.map((row) => row.id)).not.toEqual(
      expect.arrayContaining(["visit-1", "visit-2"]),
    );
    expect(upcoming).toHaveLength(61);
  });
  it("paginates public directory reads and applies search before taking the page", async () => {
    const input = dataRequestSchema.parse({
      table: "published_listings",
      columns: "id,name",
      limit: 1,
      order: [
        { column: "name", ascending: true },
        { column: "id", ascending: true },
      ],
    });
    expect(await readCustomerData(input, null)).toEqual([
      { id: "vendor-a", name: "Library A" },
    ]);
    expect(await readCustomerData({ ...input, offset: 1 }, null)).toEqual([
      { id: "vendor-b", name: "Library B" },
    ]);
    expect(
      await readCustomerData({ ...input, search: "Library B" }, null),
    ).toEqual([{ id: "vendor-b", name: "Library B" }]);
    expect(
      await readCustomerData({ ...input, search: "' OR true --" }, null),
    ).toEqual([]);
    expect(() => dataRequestSchema.parse({ ...input, offset: -1 })).toThrow();
    await expect(
      readCustomerData(
        dataRequestSchema.parse({ table: "profiles", search: "Alice" }),
        alice,
      ),
    ).rejects.toThrow("Unsupported search");
  });
  it("paginates membership cards before signing photos and keeps them customer-scoped", async () => {
    await state.db!.exec(
      `INSERT INTO admin.membership_cards(id,order_id,customer_name,photo_path,verified_by,activated_at) VALUES('card-new','paid','Alice','new-photo','staff','2030-01-02'),('card-old','other-paid','Alice','old-photo','staff','2030-01-01')`,
    );
    const page = await customerMembershipCards(alice, { limit: 1, offset: 1 });
    expect(page).toHaveLength(1);
    expect(page[0]).toMatchObject({
      id: "card-old",
      photo_url: "signed:old-photo",
      payment_method: "ONLINE",
    });
    expect(await customerMembershipCards(bob, { limit: 1, offset: 0 })).toEqual(
      [],
    );
  });
  it("installs the history ordering and pending-payment indexes", async () => {
    const result = await state.db!.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE schemaname='admin'",
    );
    expect(result.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "bookings_user_id_created_at_id_idx",
        "subscriptions_user_id_created_at_id_idx",
        "payment_orders_status_expires_at_id_idx",
        "vendor_media_listing_image_idx",
        "vendors_top_rated_listing_idx",
      ]),
    );
  });
});
