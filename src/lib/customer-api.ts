import "server-only";
import { z } from "zod";

export async function requireCustomer(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    throw new Error("Not authenticated");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error("Customer authentication is not configured");
  // Supabase verifies the JWT; never trust a decoded client-supplied subject.
  const response = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: key },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Not authenticated");
  return z.object({ id: z.uuid() }).parse(await response.json());
}

// Business-rule messages are safe to show: RAISE EXCEPTION (SQLSTATE P0001)
// text written in our migrations, and errors thrown deliberately with a plain
// Error. Prisma/driver errors use their own classes and stay hidden.
function customerFacingReason(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.constructor === Error) return error.message;
  const raised = /Code: `P0001`\. Message: `([^`]+)`/.exec(error.message);
  return raised?.[1] ?? null;
}

export function apiFailure(error: unknown) {
  if (error instanceof z.ZodError)
    return Response.json({ error: "Invalid request" }, { status: 400 });
  const message = error instanceof Error ? error.message : "Request failed";
  if (message === "Not authenticated")
    return Response.json({ error: message }, { status: 401 });
  // Logged server-side only, so configuration and database failures are
  // diagnosable from deployment logs.
  console.error("Customer API request failed", error);
  const reason = customerFacingReason(error);
  if (reason) return Response.json({ error: reason }, { status: 409 });
  // Do not serialize Prisma errors or database connection details.
  return Response.json(
    {
      error:
        "This request could not be completed. Refresh availability and try again.",
    },
    { status: 409 },
  );
}
