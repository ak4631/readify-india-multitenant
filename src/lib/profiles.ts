import { prisma } from "@/lib/prisma";

export type CustomerProfile = {
  id: string;
  fullName: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
  createdAt: Date;
};

// public.profiles / auth.users live in the RN app's Supabase schemas, not
// admin.*. There's no Prisma model for them here -- adding "public"/"auth" to
// this repo's datasource.schemas would make Prisma believe it owns every
// table in those schemas (it doesn't: mobile's own migrations create
// memberships/libraries/user_locations there), risking spurious drift on the
// next `prisma migrate dev`. Both repos share one physical Postgres instance
// and this connection already has cross-schema rights (see the bridge
// migrations), so read with raw SQL instead of a modeled table.
export async function listCustomerProfiles(): Promise<CustomerProfile[]> {
  return prisma.$queryRaw<CustomerProfile[]>`
    SELECT
      p."id"::text AS "id",
      p."full_name" AS "fullName",
      u."email" AS "email",
      p."role" AS "role",
      p."is_active" AS "isActive",
      p."created_at" AS "createdAt"
    FROM "public"."profiles" p
    LEFT JOIN "auth"."users" u ON u."id" = p."id"
    ORDER BY p."created_at" DESC
  `;
}

// Names/emails for a set of customer ids (booking.userId etc.), keyed by id.
export async function lookupCustomerProfiles(userIds: string[]) {
  const map = new Map<string, { fullName: string | null; email: string | null }>();
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return map;

  const rows = await prisma.$queryRaw<
    { id: string; fullName: string | null; email: string | null }[]
  >`
    SELECT p."id"::text AS "id", p."full_name" AS "fullName", u."email" AS "email"
    FROM "public"."profiles" p
    LEFT JOIN "auth"."users" u ON u."id" = p."id"
    WHERE p."id"::text = ANY(${ids}::text[])
  `;
  for (const row of rows) map.set(row.id, row);
  return map;
}
