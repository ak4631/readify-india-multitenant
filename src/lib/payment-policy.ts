import { createHmac, timingSafeEqual } from "node:crypto";

export function validSignature(
  message: string,
  signature: string,
  secret: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(message).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function refundEligible(
  startsAt: Date,
  cancelledAt: Date,
  actor: "customer" | "partner",
) {
  return actor === "partner" || cancelledAt.getTime() < startsAt.getTime();
}

export function captureDisposition(status: string, expiresAt: Date, now: Date) {
  if (
    status === "CAPTURED" ||
    status === "REFUNDED" ||
    status === "REFUND_PENDING"
  )
    return "unchanged";
  return status === "CREATED" && expiresAt > now ? "confirm" : "refund";
}
