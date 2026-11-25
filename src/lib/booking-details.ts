import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  acceptsVerification,
  bookingDetailsSchema,
  otpChallengeError,
  otpMode,
  phoneSchema,
} from "./booking-details-policy";
import { z } from "zod";

export type BookingDetails = {
  fullName: string;
  phone: string;
  education: string;
  purpose: string;
  requirements: string;
  phoneVerifiedAt: Date | null;
  verificationMethod: string | null;
  challengeId: string | null;
  challengeExpiresAt: Date | null;
  requestedAt: Date | null;
  attempts: number;
};
export async function readBookingDetails(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const rows = await tx.$queryRaw<BookingDetails[]>`
    SELECT full_name AS "fullName",phone,education,purpose,requirements,
      phone_verified_at AS "phoneVerifiedAt",verification_method AS "verificationMethod",
      challenge_id AS "challengeId",challenge_expires_at AS "challengeExpiresAt",requested_at AS "requestedAt",attempts
    FROM admin.customer_booking_details WHERE user_id=${userId}`;
  return rows[0];
}
export function publicBookingDetails(row?: BookingDetails) {
  return {
    fullName: row?.fullName ?? "",
    phone: row?.phone ?? "",
    education: row?.education ?? "",
    purpose: row?.purpose ?? "",
    requirements: row?.requirements ?? "",
    phoneVerified:
      !!row?.phoneVerifiedAt && acceptsVerification(row.verificationMethod),
    verificationMethod: row?.verificationMethod ?? null,
    complete:
      !!row &&
      bookingDetailsSchema.safeParse(row).success &&
      !!row.phoneVerifiedAt &&
      acceptsVerification(row.verificationMethod),
    testMode: otpMode() === "static",
  };
}
const PHONE_ALREADY_LINKED =
  "This mobile number is already linked to another account. Sign in to that account or use a different number.";

async function phoneIsLinked(
  tx: Prisma.TransactionClient,
  userId: string,
  phone: string,
) {
  // Different accounts have different user locks. Serialize attempts for the
  // same normalized phone as well; the unique index is the final backstop.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"booking-phone:" + phone}, 0))`;
  const owners = await tx.$queryRaw<{ userId: string }[]>`
    SELECT user_id AS "userId" FROM admin.customer_booking_details
    WHERE phone=${phone} AND user_id<>${userId} AND phone_verified_at IS NOT NULL LIMIT 1`;
  return owners.length > 0;
}

export async function saveBookingDetails(userId: string, body: unknown) {
  const v = bookingDetailsSchema.parse(body);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
    if (await phoneIsLinked(tx, userId, v.phone))
      throw new Error(PHONE_ALREADY_LINKED);
    await tx.$executeRaw`
      INSERT INTO admin.customer_booking_details(user_id,full_name,phone,education,purpose,requirements)
      VALUES (${userId},${v.fullName},${v.phone},${v.education},${v.purpose},${v.requirements})
      ON CONFLICT (user_id) DO UPDATE SET full_name=EXCLUDED.full_name,phone=EXCLUDED.phone,education=EXCLUDED.education,purpose=EXCLUDED.purpose,requirements=EXCLUDED.requirements,
        phone_verified_at=CASE WHEN customer_booking_details.phone=EXCLUDED.phone THEN customer_booking_details.phone_verified_at END,
        verification_method=CASE WHEN customer_booking_details.phone=EXCLUDED.phone THEN customer_booking_details.verification_method END,
        challenge_id=CASE WHEN customer_booking_details.phone=EXCLUDED.phone THEN customer_booking_details.challenge_id END`;
    return publicBookingDetails(await readBookingDetails(tx, userId));
  });
}
const otpInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), phone: phoneSchema }),
  z.object({
    action: z.literal("verify"),
    phone: phoneSchema,
    challengeId: z.uuid(),
    code: z.string().regex(/^\d{6}$/),
  }),
]);
export async function bookingOtp(userId: string, body: unknown) {
  const input = otpInput.parse(body);
  if (otpMode() !== "static")
    throw new Error(
      "Mobile verification is not configured. Please contact support.",
    );
  // Return expected failures from the transaction so failed attempts are committed.
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
    const row = await readBookingDetails(tx, userId);
    if (!row || row.phone !== input.phone)
      return {
        error: "Save your customer details before verifying this number.",
      };
    if (await phoneIsLinked(tx, userId, input.phone))
      return { error: PHONE_ALREADY_LINKED };
    if (input.action === "request") {
      if (row.requestedAt && Date.now() - row.requestedAt.getTime() < 60_000)
        return {
          error: "Please wait 60 seconds before requesting another code.",
        };
      const challengeId = randomUUID();
      const expiresAt = new Date(Date.now() + 5 * 60_000);
      await tx.$executeRaw`UPDATE admin.customer_booking_details SET challenge_id=${challengeId},challenge_expires_at=${expiresAt},requested_at=now(),attempts=0 WHERE user_id=${userId}`;
      return {
        challengeId,
        expiresAt: expiresAt.toISOString(),
        testMode: true,
      };
    }
    const error = otpChallengeError(row, input.challengeId);
    if (error) return { error };
    await tx.$executeRaw`UPDATE admin.customer_booking_details SET attempts=attempts+1 WHERE user_id=${userId}`;
    if (input.code !== "123456")
      return { error: "Incorrect code. Please try again." };
    await tx.$executeRaw`UPDATE admin.customer_booking_details SET phone_verified_at=now(),verification_method='static',challenge_id=NULL,challenge_expires_at=NULL WHERE user_id=${userId}`;
    return { verified: true, testMode: true };
  });
  if ("error" in result) throw new Error(result.error);
  return result;
}
export async function requireBookingDetails(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const row = await readBookingDetails(tx, userId);
  if (!publicBookingDetails(row).complete)
    throw new Error(
      "Complete your customer details and mobile verification before booking.",
    );
  return row!;
}
export async function snapshotBookingDetails(
  tx: Prisma.TransactionClient,
  userId: string,
  targetId: string,
  row: BookingDetails,
) {
  await tx.$executeRaw`INSERT INTO admin.booking_customer_snapshots(target_id,user_id,full_name,phone,education,purpose,requirements,phone_verified_at,verification_method)
    VALUES (${targetId},${userId},${row.fullName},${row.phone},${row.education},${row.purpose},${row.requirements},${row.phoneVerifiedAt},${row.verificationMethod}) ON CONFLICT (target_id) DO NOTHING`;
}
