export async function GET() {
  return Response.json(
    { status: "ok", service: "zerotham-backend" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
