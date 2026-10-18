import "server-only";

export function paymentConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret)
    throw new Error("Payments are not configured. Please try again later.");
  return { keyId, keySecret };
}

export async function razorpay<T>(
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T> {
  const { keyId, keySecret } = paymentConfig();
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(
      "The payment provider could not complete this request. Please retry.",
    );
  return response.json() as Promise<T>;
}

export type GatewayPayment = {
  id: string;
  order_id: string;
  status: string;
  amount: number;
  currency: string;
};
