import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const identifier = z
  .string()
  .regex(/^[a-z_][a-z0-9_]*$/)
  .max(64);
export const dataRequestSchema = z
  .object({
    table: z.enum([
      "published_listings",
      "listing_plans",
      "listing_reviews",
      "service_catalog",
      "customer_bookings",
      "customer_flex_bookings",
      "customer_payment_orders",
      "customer_subscriptions",
      "customer_notifications",
      "customer_support_tickets",
      "customer_wishlist",
      "profiles",
      "user_locations",
    ]),
    action: z.enum(["select", "upsert", "delete"]).default("select"),
    columns: z.string().max(2000).default("*"),
    filters: z
      .array(
        z
          .object({
            column: identifier,
            op: z.enum(["eq", "in", "gt"]),
            value: z.union([
              z.string().max(500),
              z.number().finite(),
              z.boolean(),
              z.array(z.string().max(128)).max(500),
            ]),
          })
          .strict(),
      )
      .max(12)
      .default([]),
    order: z
      .array(
        z
          .object({
            column: identifier,
            ascending: z.boolean(),
            nullsFirst: z.boolean().optional(),
          })
          .strict(),
      )
      .max(4)
      .default([]),
    limit: z.number().int().min(1).max(500).default(500),
    single: z.enum(["single", "maybeSingle"]).optional(),
    values: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export const publicDataTables = new Set([
  "published_listings",
  "listing_plans",
  "listing_reviews",
  "service_catalog",
]);
const ownedTables: Record<string, string> = {
  profiles: "id",
  user_locations: "user_id",
  customer_wishlist: "user_id",
};
function column(name: string) {
  return Prisma.raw(`"${identifier.parse(name)}"`);
}

export async function readCustomerData(
  input: z.infer<typeof dataRequestSchema>,
  userId: string | null,
) {
  if (
    (!publicDataTables.has(input.table) || input.action !== "select") &&
    !userId
  )
    throw new Error("Not authenticated");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub', ${userId ?? ""}, true)`;
    // Explicit owner predicates also protect tables when the runtime role owns them and bypasses RLS.
    const predicates: Prisma.Sql[] = [];
    const owner = ownedTables[input.table];
    if (owner) predicates.push(Prisma.sql`${column(owner)} = ${userId}::uuid`);
    for (const filter of input.filters) {
      const name = column(filter.column);
      if (filter.op === "in") {
        if (!Array.isArray(filter.value)) throw new Error("Invalid filter");
        predicates.push(
          filter.value.length
            ? Prisma.sql`${name} IN (${Prisma.join(filter.value)})`
            : Prisma.sql`FALSE`,
        );
      } else {
        if (Array.isArray(filter.value)) throw new Error("Invalid filter");
        predicates.push(
          filter.op === "eq"
            ? Prisma.sql`${name} = ${filter.value}`
            : Prisma.sql`${name} > ${filter.value}`,
        );
      }
    }
    const table = Prisma.raw(`public."${input.table}"`);
    const where = predicates.length
      ? Prisma.sql`WHERE ${Prisma.join(predicates, " AND ")}`
      : Prisma.empty;
    if (input.action === "delete") {
      if (
        input.table !== "customer_wishlist" ||
        !input.filters.some((f) => f.column === "vendor_id" && f.op === "eq")
      )
        throw new Error("Unsupported delete");
      await tx.$executeRaw(Prisma.sql`DELETE FROM ${table} ${where}`);
      return null;
    }
    if (input.action === "upsert") {
      const value = input.values ?? {};
      if (input.table === "profiles") {
        const name = z.string().trim().max(200).parse(value.full_name);
        await tx.$executeRaw`UPDATE public.profiles SET full_name=${name} WHERE id=${userId}::uuid`;
      } else if (input.table === "customer_wishlist") {
        const vendor = z.string().min(1).max(128).parse(value.vendor_id);
        await tx.$executeRaw`INSERT INTO public.customer_wishlist(user_id,vendor_id) VALUES(${userId}::uuid,${vendor}) ON CONFLICT DO NOTHING`;
      } else if (input.table === "user_locations") {
        const location = z
          .object({
            latitude: z.number().min(-90).max(90),
            longitude: z.number().min(-180).max(180),
            address: z.string().max(1000).nullable().optional(),
            source: z.enum(["gps", "manual"]),
            permission_status: z.enum(["granted", "denied", "undetermined"]),
          })
          .parse(value);
        await tx.$executeRaw`INSERT INTO public.user_locations(user_id,latitude,longitude,address,source,permission_status) VALUES(${userId}::uuid,${location.latitude},${location.longitude},${location.address ?? null},${location.source},${location.permission_status}) ON CONFLICT(user_id) DO UPDATE SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,address=EXCLUDED.address,source=EXCLUDED.source,permission_status=EXCLUDED.permission_status,updated_at=now()`;
      } else throw new Error("Unsupported write");
      return null;
    }
    const names =
      input.columns === "*"
        ? Prisma.raw("*")
        : Prisma.join(input.columns.split(",").map((s) => column(s.trim())));
    const order = input.order.length
      ? Prisma.sql`ORDER BY ${Prisma.join(input.order.map((o) => Prisma.sql`${column(o.column)} ${Prisma.raw(o.ascending ? "ASC" : "DESC")} ${Prisma.raw(o.nullsFirst ? "NULLS FIRST" : "NULLS LAST")}`))}`
      : Prisma.empty;
    const rows = await tx.$queryRaw<unknown[]>(
      Prisma.sql`SELECT ${names} FROM ${table} ${where} ${order} LIMIT ${input.limit}`,
    );
    if (input.single) {
      if (rows.length > 1 || (input.single === "single" && rows.length !== 1))
        throw new Error("Expected one result");
      return rows[0] ?? null;
    }
    return rows;
  });
}

// Only these existing database functions are remotely callable. Types and names are fixed here.
export const customerRpcDefinitions: Record<string, Record<string, string>> = {
  nearby_vendors: {
    p_latitude: "numeric",
    p_longitude: "numeric",
    p_category: "text",
    p_radius_km: "numeric",
    p_limit: "integer",
    p_offset: "integer",
  },
  get_slot_availability: { p_vendor_id: "text", p_slot_date: "date" },
  get_purchase_options: {
    p_vendor_id: "text",
    p_plan_id: "text",
    p_date: "date",
    p_days: "integer",
    p_hours: "integer",
  },
  create_customer_review: {
    p_vendor_id: "text",
    p_rating: "integer",
    p_review_text: "text",
    p_booking_id: "text",
  },
  create_customer_support_ticket: { p_subject: "text", p_message: "text" },
  register_customer_push_token: { p_token: "text" },
  unregister_customer_push_token: { p_token: "text" },
  mark_customer_notification_read: { p_id: "text" },
  get_promotional_banners: { p_use_saved_location: "boolean" },
};
export const publicCustomerRpcs = new Set([
  "nearby_vendors",
  "get_slot_availability",
  "get_purchase_options",
  "get_promotional_banners",
]);
export async function callCustomerRpc(
  name: string,
  args: Record<string, unknown>,
  userId: string | null,
) {
  if (!Object.hasOwn(customerRpcDefinitions, name))
    throw new Error("Unknown operation");
  const definition = customerRpcDefinitions[name];
  if (Object.keys(args).some((key) => !Object.hasOwn(definition, key)))
    throw new Error("Unknown argument");
  if (!publicCustomerRpcs.has(name) && !userId)
    throw new Error("Not authenticated");
  const parameters = Object.entries(args).map(([key, value]) => {
    const valid = z
      .union([z.string().max(5000), z.number().finite(), z.boolean(), z.null()])
      .parse(value);
    return Prisma.sql`${column(key)} => ${valid}::${Prisma.raw(definition[key])}`;
  });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub', ${userId ?? ""}, true)`;
    return tx.$queryRaw<unknown[]>(
      Prisma.sql`SELECT * FROM public.${column(name)}(${Prisma.join(parameters)})`,
    );
  });
}
