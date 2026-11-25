import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const state = vi.hoisted(() => ({ db: null as PGlite | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => {
  const raw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sql = strings.reduce(
      (text, part, index) => text + (index ? `$${index}` : "") + part,
      "",
    );
    return (await state.db!.query(sql, values)).rows;
  };
  const tx = { $queryRaw: raw, $executeRaw: raw };
  return {
    prisma: {
      ...tx,
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
  bookingOtp,
  publicBookingDetails,
  readBookingDetails,
  requireBookingDetails,
  saveBookingDetails,
  snapshotBookingDetails,
} from "@/lib/booking-details";
import { prisma } from "@/lib/prisma";
const details = {
  fullName: "Asha Patel",
  phone: "+919876543210",
  education: "Graduation",
  purpose: "Exam Preparation",
  requirements: "UPSC",
};
const request = () =>
  bookingOtp("customer", { action: "request", phone: details.phone });
async function verified() {
  await saveBookingDetails("customer", details);
  const challenge = await request();
  if (!("challengeId" in challenge)) throw new Error("No challenge");
  await bookingOtp("customer", {
    action: "verify",
    phone: details.phone,
    challengeId: challenge.challengeId,
    code: "123456",
  });
  return challenge;
}
describe("persisted booking OTP lifecycle", () => {
  beforeAll(async () => {
    state.db = new PGlite();
    await state.db.exec(
      "CREATE SCHEMA admin; CREATE ROLE anon; CREATE ROLE authenticated;",
    );
    await state.db.exec(
      readFileSync(
        "prisma/migrations/20261123190000_booking_customer_details/migration.sql",
        "utf8",
      ),
    );
    await state.db.exec(
      readFileSync(
        "prisma/migrations/20261125010000_unique_verified_customer_phone/migration.sql",
        "utf8",
      ),
    );
  });
  beforeEach(async () => {
    vi.stubEnv("BOOKING_OTP_MODE", "static");
    await state.db!.exec(
      "TRUNCATE admin.customer_booking_details,admin.booking_customer_snapshots",
    );
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await state.db!.close();
  });
  it("blocks checkout until details and OTP are complete, and rejects replay", async () => {
    await expect(requireBookingDetails(prisma, "customer")).rejects.toThrow(
      "Complete",
    );
    const challenge = await verified();
    expect(
      publicBookingDetails(await requireBookingDetails(prisma, "customer"))
        .complete,
    ).toBe(true);
    await expect(
      bookingOtp("customer", {
        action: "verify",
        phone: details.phone,
        challengeId: challenge.challengeId,
        code: "123456",
      }),
    ).rejects.toThrow("expired");
  });
  it("preserves proof on non-phone edits, clears proof on a phone change", async () => {
    await verified();
    expect(
      (await saveBookingDetails("customer", { ...details, purpose: "Reading" }))
        .complete,
    ).toBe(true);
    const changed = await saveBookingDetails("customer", {
      ...details,
      phone: "+919999999999",
    });
    expect(changed.phoneVerified).toBe(false);
    await expect(requireBookingDetails(prisma, "customer")).rejects.toThrow(
      "Complete",
    );
    expect((await saveBookingDetails("customer", details)).phoneVerified).toBe(
      false,
    );
  });
  it("persists failed attempts and locks a challenge after five failures", async () => {
    await saveBookingDetails("customer", details);
    const challenge = await request();
    for (let attempt = 0; attempt < 5; attempt++)
      await expect(
        bookingOtp("customer", {
          action: "verify",
          phone: details.phone,
          challengeId: challenge.challengeId,
          code: "000000",
        }),
      ).rejects.toThrow("Incorrect");
    expect((await readBookingDetails(prisma, "customer"))?.attempts).toBe(5);
    await expect(
      bookingOtp("customer", {
        action: "verify",
        phone: details.phone,
        challengeId: challenge.challengeId,
        code: "123456",
      }),
    ).rejects.toThrow("Too many");
    await expect(request()).rejects.toThrow("60 seconds");
  });
  it("rejects expired challenges and prevents cross-customer verification", async () => {
    await saveBookingDetails("customer", details);
    const challenge = await request();
    await expect(
      bookingOtp("other", {
        action: "verify",
        phone: details.phone,
        challengeId: challenge.challengeId,
        code: "123456",
      }),
    ).rejects.toThrow("Save your");
    await state.db!.exec(
      "UPDATE admin.customer_booking_details SET challenge_expires_at=now()-interval '1 second'",
    );
    await expect(
      bookingOtp("customer", {
        action: "verify",
        phone: details.phone,
        challengeId: challenge.challengeId,
        code: "123456",
      }),
    ).rejects.toThrow("expired");
  });
  it("keeps the original booking contact details when the profile changes", async () => {
    await verified();
    await snapshotBookingDetails(
      prisma,
      "customer",
      "booking",
      await requireBookingDetails(prisma, "customer"),
    );
    await saveBookingDetails("customer", {
      ...details,
      fullName: "Updated Name",
      purpose: "Reading",
    });
    const { rows } = await state.db!.query<{
      full_name: string;
      purpose: string;
      verification_method: string;
    }>("SELECT * FROM admin.booking_customer_snapshots");
    expect(rows[0]).toMatchObject({
      full_name: "Asha Patel",
      purpose: "Exam Preparation",
      verification_method: "static",
    });
  });
  it("does not grant client roles access to proof or snapshots", async () => {
    const result = await state.db!.query<{ allowed: boolean }>(
      "SELECT has_table_privilege('authenticated','admin.customer_booking_details','UPDATE') AS allowed",
    );
    expect(result.rows[0].allowed).toBe(false);
  });
  it("rejects linking a verified number to another account, including formatting variants", async () => {
    await verified();
    await expect(
      saveBookingDetails("other", { ...details, phone: "+91 98765-43210" }),
    ).rejects.toThrow("already linked");
    expect((await saveBookingDetails("customer", details)).complete).toBe(true);
  });
  it("rejects an outstanding challenge when another account verified the phone first", async () => {
    await saveBookingDetails("other", details);
    const pending = await bookingOtp("other", {
      action: "request",
      phone: details.phone,
    });
    await verified();
    await expect(
      bookingOtp("other", {
        action: "verify",
        phone: details.phone,
        challengeId: pending.challengeId,
        code: "123456",
      }),
    ).rejects.toThrow("already linked");
    await expect(
      bookingOtp("other", { action: "request", phone: details.phone }),
    ).rejects.toThrow("already linked");
    expect(
      (await readBookingDetails(prisma, "other"))?.phoneVerifiedAt,
    ).toBeNull();
  });
  it("enforces uniqueness even when a writer bypasses the service", async () => {
    await saveBookingDetails("other", details);
    await verified();
    await expect(
      state.db!.exec(
        "UPDATE admin.customer_booking_details SET phone_verified_at=now(),verification_method='static' WHERE user_id='other'",
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });
  it("releases the old number after its owner changes phone", async () => {
    await verified();
    await saveBookingDetails("customer", {
      ...details,
      phone: "+919999999999",
    });
    await expect(saveBookingDetails("other", details)).resolves.toMatchObject({
      phoneVerified: false,
    });
    const pending = await bookingOtp("other", {
      action: "request",
      phone: details.phone,
    });
    await expect(
      bookingOtp("other", {
        action: "verify",
        phone: details.phone,
        challengeId: pending.challengeId,
        code: "123456",
      }),
    ).resolves.toMatchObject({ verified: true });
  });
});
