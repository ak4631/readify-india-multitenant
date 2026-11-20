import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { Prisma } from "@/generated/prisma/client";
import {
  bookingListQuery,
  type BookingListFilters,
} from "@/lib/booking-list-query";

describe("Unified booking list", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      CREATE SCHEMA admin; CREATE SCHEMA auth;
      CREATE TABLE admin.vendors(id text,name text,time_zone text);
      CREATE TABLE public.profiles(id text,full_name text);
      CREATE TABLE auth.users(id text,email text);
      CREATE TABLE admin.library_seats(id text,label text);
      CREATE TABLE admin.membership_plans(id text,name text);
      CREATE TABLE admin.bookings(id text,vendor_id text,user_id text,booking_code text,created_at timestamp,booking_date timestamp,status text,amount numeric,seat_id text,plan_id text,seat_label text,start_at timestamptz,end_at timestamptz,time_label text,duration_hours numeric);
      CREATE TABLE admin.flex_bookings(id text,vendor_id text,user_id text,booking_code text,created_at timestamp,start_date date,status text,amount numeric,seat_id text,slot_start time,slot_hours int,days int);
      INSERT INTO admin.vendors VALUES ('a','North Library','Asia/Kolkata'),('b','South Library','America/New_York');
      INSERT INTO public.profiles VALUES ('customer','Asha');
      INSERT INTO auth.users VALUES ('customer','asha@example.test');
      INSERT INTO admin.bookings(id,vendor_id,user_id,booking_code,created_at,booking_date,status,amount)
        SELECT 'booking-'||n,'a','customer','CODE-'||n,'2035-01-01'::timestamp+n*interval '1 minute','2035-01-05','CONFIRMED',100 FROM generate_series(1,35) n;
      INSERT INTO admin.bookings(id,vendor_id,user_id,created_at,booking_date,status,amount)
        VALUES ('other','b','customer','2035-01-03','2035-01-06','CANCELLED',200);
      INSERT INTO admin.flex_bookings VALUES ('flex','a','customer','FLEX-CODE','2035-01-02','2035-01-05','PENDING',300,null,'06:00',4,2);
    `);
  });
  afterAll(async () => {
    await db.close();
  });

  async function run(
    ids: string[] | null,
    filters: BookingListFilters = {},
    offset = 0,
  ) {
    const cte = bookingListQuery(ids, filters);
    const query = Prisma.sql`${cte} SELECT id FROM filtered ORDER BY created_at DESC,id DESC LIMIT ${20} OFFSET ${offset}`;
    return (await db.query<{ id: string }>(query.text, query.values)).rows.map(
      (r) => r.id,
    );
  }
  it("paginates both booking sources together without dropping old records", async () => {
    const first = await run(["a"]);
    const second = await run(["a"], {}, 20);
    expect(first).toHaveLength(20);
    expect(first[0]).toBe("flex");
    expect(second).toHaveLength(16);
    expect(new Set([...first, ...second]).size).toBe(36);
  });
  it("keeps tenant scope even when another listing is selected", async () => {
    expect(await run(["a"], { vendorId: "b" })).toEqual([]);
    expect(await run([], {})).toEqual([]);
    expect((await run(null))[0]).toBe("other");
  });
  it("filters before paging by customer, code, listing, status and date", async () => {
    expect(
      await run(["a"], {
        q: "flex-code",
        status: "pending",
        date: "2035-01-05",
      }),
    ).toEqual(["flex"]);
    expect(await run(["a"], { q: "ASHA@EXAMPLE.TEST" })).toHaveLength(20);
    expect(
      await run(null, { q: "South Library", status: "cancelled" }),
    ).toEqual(["other"]);
    expect(await run(["a"], { date: "2035-01-06" })).toEqual([]);
    expect(await run(["a"], { q: "' OR 1=1 --" })).toEqual([]);
  });
  it("counts the full filtered result rather than just a page", async () => {
    const cte = bookingListQuery(["a"], { status: "confirmed" });
    const query = Prisma.sql`${cte} SELECT count(*)::int total FROM filtered`;
    expect(
      (await db.query<{ total: number }>(query.text, query.values)).rows[0]
        .total,
    ).toBe(35);
  });
});
