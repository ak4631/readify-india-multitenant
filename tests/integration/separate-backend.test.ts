import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { migrationSql } from "../../backend/database/migration-sql.mjs";
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
});
