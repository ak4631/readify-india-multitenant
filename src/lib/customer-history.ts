import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const historyRequestSchema = z.object({
  kind: z.enum(["bookings", "subscriptions"]),
  bucket: z.enum(["upcoming", "completed", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  vendorId: z.string().min(1).max(128).optional(),
  status: z.literal("active").optional(),
});

// Authenticate once and fetch payment metadata only for this page's targets.
// The public views retain their auth.uid() ownership checks inside the transaction.
export async function readCustomerHistory(
  userId: string,
  input: z.infer<typeof historyRequestSchema>,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`;
    if (input.kind === "subscriptions")
      return tx.$queryRaw`
      WITH page AS (
        SELECT id,vendor_id,library_name,plan_id,plan_name,start_date,end_date,
          total_amount,status,created_at,slot_start,slot_hours,seat_number
        FROM public.customer_subscriptions
        WHERE (${input.vendorId ?? null}::text IS NULL OR vendor_id=${input.vendorId ?? null})
          AND (${input.status ?? null}::text IS NULL OR status=${input.status ?? null})
        ORDER BY created_at DESC,id DESC LIMIT ${input.limit} OFFSET ${input.offset}
      )
      SELECT s.id,s.vendor_id,s.library_name,s.plan_id,s.plan_name,s.start_date,s.end_date,
        s.total_amount,s.status,s.created_at,s.slot_start,s.slot_hours,s.seat_number,
        o.status AS payment_status,o.payment_method,o.expires_at AS payment_deadline
      FROM page s LEFT JOIN admin.payment_orders o ON o.target_id=s.id AND o.user_id=${userId}
      ORDER BY s.created_at DESC,s.id DESC`;
    return tx.$queryRaw`
      WITH entries AS (
        SELECT id,booking_code,booking_date,date_label,time_label,seat_label,seat_number,
          total_amount,status,created_at,library_name,'visit' AS kind FROM public.customer_bookings
        UNION ALL
        SELECT id,booking_code,booking_date,date_label,time_label,seat_label,seat_number,
          total_amount,status,created_at,library_name,'flex' AS kind FROM public.customer_flex_bookings
      ), page AS (
        SELECT id,booking_code,booking_date,date_label,time_label,seat_label,seat_number,
          total_amount,status,created_at,library_name,kind FROM entries
        WHERE (${input.bucket ?? null}::text IS NULL OR
          CASE WHEN status='cancelled' THEN 'cancelled'
            WHEN status IN ('completed','expired') OR (kind<>'flex' AND booking_date<(now() AT TIME ZONE 'UTC')::date::text) THEN 'completed'
            ELSE 'upcoming' END=${input.bucket ?? null})
        ORDER BY created_at DESC,id DESC LIMIT ${input.limit} OFFSET ${input.offset}
      )
      SELECT b.id,b.booking_code,b.booking_date,b.date_label,b.time_label,b.seat_label,b.seat_number,
        b.total_amount,b.status,b.created_at,b.library_name,b.kind,
        o.status AS payment_status,o.vendor_id,o.payment_method,o.expires_at AS payment_deadline,o.verification_required
      FROM page b LEFT JOIN admin.payment_orders o ON o.target_id=b.id AND o.user_id=${userId}
      ORDER BY b.created_at DESC,b.id DESC`;
  });
}
