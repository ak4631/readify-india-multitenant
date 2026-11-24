import { randomUUID } from "node:crypto";
import { authOptions } from "@/lib/auth";
import {
  getCurrentSession,
  resolveDataScope,
  getAccessibleVendorIds,
} from "@/lib/rbac";
import { verifyBackendSignature } from "@/lib/backend-signature";
import { encodeWire, decodeWire, type Wire } from "@/lib/backend-wire";
import { serializeActionValue } from "@/lib/serialize-action-value";
import { invokeAction } from "@/server/actions/invoke.actions";
import { invalidations, type Invalidation } from "@/lib/backend-invalidations";
import { actions } from "@/action-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
export async function POST(request: Request) {
  // This is a server-to-server endpoint; no browser-supplied identity is accepted.
  if (process.env.BACKEND_URL)
    return Response.json(
      { error: "Invalid backend configuration" },
      { status: 503 },
    );
  const secret = process.env.BACKEND_SHARED_SECRET ?? "";
  if (secret.length < 32)
    return Response.json({ error: "Backend not configured" }, { status: 503 });
  const length = Number(request.headers.get("content-length"));
  if (length > 6 * 1024 * 1024) return new Response(null, { status: 413 });
  // Bound chunked bodies too, before JSON/file decoding.
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 6 * 1024 * 1024) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if (
    !verifyBackendSignature(
      secret,
      request.headers.get("x-backend-time") ?? "",
      request.headers.get("cookie") ?? "",
      body,
      request.headers.get("x-backend-signature") ?? "",
    )
  )
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: noStore },
    );
  try {
    const payload = JSON.parse(body) as { operation: string; args: Wire };
    const args = decodeWire(payload.args);
    if (!Array.isArray(args)) return new Response(null, { status: 400 });
    const changes: Invalidation[] = [];
    const result = await invalidations.run(changes, async () => {
      if (payload.operation === "identity.authenticate") {
        const provider = authOptions.providers[0] as unknown as {
          options: { authorize: (credentials: never) => Promise<unknown> };
        };
        return {
          success: true,
          value: await provider.options.authorize(args[0] as never),
        };
      }
      if (payload.operation === "identity.refresh") {
        return {
          success: true,
          value: await authOptions.callbacks!.jwt!({ token: args[0] } as never),
        };
      }
      if (payload.operation.startsWith("access.")) {
        const session = await getCurrentSession();
        if (!session?.user)
          return { success: false, message: "Not authenticated" };
        if (payload.operation === "access.resolveDataScope")
          return invokeAction(
            () => resolveDataScope(session, args[0] as string | undefined),
            [],
          );
        if (payload.operation === "access.getAccessibleVendorIds")
          return invokeAction(
            () =>
              getAccessibleVendorIds(session, args[0] as string | undefined),
            [],
          );
      }
      if (!Object.hasOwn(actions, payload.operation))
        return { success: false, message: "Unknown backend operation" };
      return invokeAction(actions[payload.operation], args as never[]);
    });
    return Response.json(
      result.success
        ? {
            success: true,
            value: await encodeWire(serializeActionValue(result.value)),
            invalidations: changes,
          }
        : result,
      { headers: noStore },
    );
  } catch (error) {
    const reference = randomUUID();
    console.error("Backend dispatch failed", { reference, error });
    return Response.json(
      {
        success: false,
        message: `Backend request failed. Reference: ${reference}`,
      },
      { headers: noStore },
    );
  }
}
