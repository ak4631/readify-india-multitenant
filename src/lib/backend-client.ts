import "server-only";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { PublicActionError } from "@/lib/public-action-error";
import { encodeWire, decodeWire, type Wire } from "@/lib/backend-wire";
import { backendSignature } from "@/lib/backend-signature";

export async function callBackend<T>(
  operation: string,
  args: unknown[],
): Promise<T> {
  const origin = process.env.BACKEND_URL;
  if (!origin) throw new Error("BACKEND_URL is required");
  const url = new URL(origin);
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "backend"].includes(url.hostname)
  )
    throw new Error("Backend requires HTTPS");
  const cookie = (await headers()).get("cookie") ?? "";
  const body = JSON.stringify({ operation, args: await encodeWire(args) });
  const timestamp = String(Date.now());
  const response = await fetch(new URL("/api/internal/dispatch", url), {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    headers: {
      "content-type": "application/json",
      cookie,
      "x-backend-time": timestamp,
      "x-backend-signature": backendSignature(
        process.env.BACKEND_SHARED_SECRET ?? "",
        timestamp,
        cookie,
        body,
      ),
    },
    body,
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(`Backend request failed (${response.status})`);
  const result = (await response.json()) as {
    success: boolean;
    value?: Wire;
    message?: string;
    invalidations?: [string, "page" | "layout" | undefined][];
  };
  if (!result.success)
    throw new PublicActionError(
      result.message ?? "Could not complete this request",
    );
  for (const [path, type] of result.invalidations ?? [])
    revalidatePath(path, type ?? undefined);
  return decodeWire(result.value!) as T;
}
