import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const s = vi.hoisted(() => ({
  row: undefined as Record<string, unknown> | undefined,
  execute: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: s.execute,
        $queryRaw: async () => (s.row ? [s.row] : []),
      }),
  },
}));
import { bookingOtp, publicBookingDetails } from "@/lib/booking-details";
import {
  acceptsVerification,
  bookingDetailsSchema,
  otpChallengeError,
  phoneSchema,
} from "@/lib/booking-details-policy";
const profile = () => ({
  fullName: "Asha Patel",
  phone: "+919876543210",
  education: "Graduation",
  purpose: "Exam Preparation",
  requirements: "",
  phoneVerifiedAt: null as Date | null,
  verificationMethod: null as string | null,
  challengeId: "11111111-1111-4111-8111-111111111111",
  challengeExpiresAt: new Date(Date.now() + 300000),
  requestedAt: new Date(Date.now() - 61000),
  attempts: 0,
});
beforeEach(() => {
  vi.stubEnv("BOOKING_OTP_MODE", "static");
  s.execute.mockReset();
  s.row = profile();
});
describe("booking details and temporary OTP", () => {
  it("normalizes phone numbers and validates required details", () => {
    expect(phoneSchema.parse("+91 98765-43210")).toBe("+919876543210");
    expect(phoneSchema.safeParse("9876543210").success).toBe(false);
    expect(
      bookingDetailsSchema.safeParse({ ...profile(), purpose: "Other" })
        .success,
    ).toBe(false);
    expect(
      bookingDetailsSchema.safeParse({
        ...profile(),
        purpose: "Other",
        requirements: "Research",
      }).success,
    ).toBe(true);
  });
  it("never trusts an incomplete or unverified profile", () => {
    expect(publicBookingDetails(profile()).complete).toBe(false);
    expect(
      publicBookingDetails({
        ...profile(),
        phoneVerifiedAt: new Date(),
        verificationMethod: "static",
      }).complete,
    ).toBe(true);
    expect(
      publicBookingDetails({
        ...profile(),
        education: "",
        phoneVerifiedAt: new Date(),
        verificationMethod: "static",
      }).complete,
    ).toBe(false);
  });
  it("rejects expired, mismatched, consumed and exhausted challenges", () => {
    const row = profile();
    expect(otpChallengeError(row, row.challengeId)).toBeNull();
    expect(
      otpChallengeError({ ...row, challengeId: null }, row.challengeId),
    ).toContain("expired");
    expect(
      otpChallengeError(
        { ...row, challengeExpiresAt: new Date(0) },
        row.challengeId,
      ),
    ).toContain("expired");
    expect(otpChallengeError(row, "another")).toContain("expired");
    expect(
      otpChallengeError({ ...row, attempts: 5 }, row.challengeId),
    ).toContain("Too many");
  });
  it("binds the OTP to the saved number and signed-in user's challenge", async () => {
    await expect(
      bookingOtp("customer", {
        action: "verify",
        phone: "+919999999999",
        challengeId: profile().challengeId,
        code: "123456",
      }),
    ).rejects.toThrow("Save your");
    await expect(
      bookingOtp("customer", {
        action: "verify",
        phone: profile().phone,
        challengeId: "22222222-2222-4222-8222-222222222222",
        code: "123456",
      }),
    ).rejects.toThrow("expired");
  });
  it("commits a failed attempt before returning an error", async () => {
    await expect(
      bookingOtp("customer", {
        action: "verify",
        phone: profile().phone,
        challengeId: profile().challengeId,
        code: "000000",
      }),
    ).rejects.toThrow("Incorrect");
    expect(
      s.execute.mock.calls.some(([sql]) =>
        sql.join("").includes("attempts=attempts+1"),
      ),
    ).toBe(true);
    expect(
      s.execute.mock.calls.some(([sql]) =>
        sql.join("").includes("phone_verified_at=now()"),
      ),
    ).toBe(false);
  });
  it("accepts 123456 only for a live challenge and consumes it", async () => {
    await expect(
      bookingOtp("customer", {
        action: "verify",
        phone: profile().phone,
        challengeId: profile().challengeId,
        code: "123456",
      }),
    ).resolves.toMatchObject({ verified: true, testMode: true });
    expect(
      s.execute.mock.calls.some(([sql]) =>
        sql.join("").includes("challenge_id=NULL"),
      ),
    ).toBe(true);
  });
  it("enforces a persistent resend cooldown", async () => {
    s.row = { ...profile(), requestedAt: new Date() };
    await expect(
      bookingOtp("customer", { action: "request", phone: profile().phone }),
    ).rejects.toThrow("60 seconds");
  });
  it("does not accept test evidence when static mode is disabled", async () => {
    vi.stubEnv("BOOKING_OTP_MODE", "disabled");
    expect(acceptsVerification("static")).toBe(false);
    await expect(
      bookingOtp("customer", { action: "request", phone: profile().phone }),
    ).rejects.toThrow("not configured");
  });
  it("defaults production to disabled without explicit opt-in", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.BOOKING_OTP_MODE;
    expect(acceptsVerification("static")).toBe(false);
    vi.unstubAllEnvs();
  });
});
