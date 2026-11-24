import { createHmac, timingSafeEqual } from "node:crypto";
export function backendSignature(
  secret: string,
  timestamp: string,
  cookie: string,
  body: string,
) {
  if (secret.length < 32)
    throw new Error(
      "BACKEND_SHARED_SECRET must contain at least 32 characters",
    );
  return createHmac("sha256", secret)
    .update(JSON.stringify([timestamp, cookie, body]))
    .digest("hex");
}
export function verifyBackendSignature(
  secret: string,
  timestamp: string,
  cookie: string,
  body: string,
  signature: string,
  now = Date.now(),
) {
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(now - Number(timestamp)) > 60_000 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return false;
  const expected = backendSignature(secret, timestamp, cookie, body);
  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signature, "hex"),
  );
}
