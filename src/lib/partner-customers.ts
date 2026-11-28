import { prisma } from "@/lib/prisma";
import { toPage, type pageWindow } from "@/lib/pagination";
import type {
  CustomerRow,
  CustomerType,
} from "@/server/actions/customers.actions";

// Aggregate and paginate inside Postgres. Payment totals and profile details
// are fetched only for the visible page; no subscription history is loaded in JS.
export async function listPartnerCustomerPage(
  partnerId: string,
  type: CustomerType,
  asOf: Date,
  window: ReturnType<typeof pageWindow>,
) {
  type JsonCustomer = Omit<CustomerRow, "joinedAt" | "lastActivityAt"> & {
    joinedAt: string;
    lastActivityAt: string;
  };
  const [result] = await prisma.$queryRaw<
    { total: number; items: JsonCustomer[] }[]
  >`
    WITH events AS (
      SELECT b.user_id, b.created_at, 1 AS bookings, 0 AS flexible, 0 AS active
      FROM admin.bookings b JOIN admin.vendors v ON v.id=b.vendor_id WHERE v.partner_id=${partnerId}
      UNION ALL
      SELECT f.user_id,f.created_at,1,1,0
      FROM admin.flex_bookings f JOIN admin.vendors v ON v.id=f.vendor_id WHERE v.partner_id=${partnerId}
      UNION ALL
      SELECT s.user_id,s.created_at,0,0,CASE WHEN s.status='ACTIVE' THEN 1 ELSE 0 END
      FROM admin.subscriptions s JOIN admin.vendors v ON v.id=s.vendor_id WHERE v.partner_id=${partnerId}
    ), stats AS (
      SELECT user_id, sum(bookings)::int AS bookings, sum(flexible)::int AS flexible,
        sum(active)::int AS active, min(created_at) AS joined_at, max(created_at) AS last_activity
      FROM events GROUP BY user_id
    ), filtered AS (
      SELECT s.*, EXISTS(
        SELECT 1 FROM admin.attendance_visits a JOIN admin.vendors v ON v.id=a.vendor_id
        WHERE a.user_id=s.user_id AND a.checked_out_at IS NULL AND v.partner_id=${partnerId}
      ) AS present FROM stats s
      WHERE ${type}='all'
        OR (${type}='permanent' AND s.active>0)
        OR (${type}='flexible' AND s.flexible>0)
        OR (${type}='new' AND s.joined_at>(${asOf}::timestamptz AT TIME ZONE 'UTC') - interval '7 days')
        OR (${type}='active' AND EXISTS(
          SELECT 1 FROM admin.attendance_visits a JOIN admin.vendors v ON v.id=a.vendor_id
          WHERE a.user_id=s.user_id AND a.checked_out_at IS NULL AND v.partner_id=${partnerId}
        ))
    ), page AS (
      SELECT user_id,bookings,flexible,active,joined_at,last_activity,present
      FROM filtered ORDER BY last_activity DESC,user_id DESC LIMIT ${window.take} OFFSET ${window.skip}
    )
    SELECT (SELECT count(*)::int FROM filtered) AS total,
      coalesce((SELECT jsonb_agg(row_data ORDER BY "lastActivityAt" DESC,id DESC) FROM (
        SELECT s.user_id AS id,p.full_name AS "fullName",u.email,
          NULL AS role,NULL AS "isActive",s.bookings AS "totalBookings",
          s.active AS "activeSubscriptions",s.flexible AS "flexibleBookings",s.present,
          coalesce((SELECT sum(o.amount_paise)::numeric/100 FROM admin.payment_orders o
            JOIN admin.vendors v ON v.id=o.vendor_id
            WHERE o.user_id=s.user_id AND v.partner_id=${partnerId}
              AND o.captured_at IS NOT NULL AND o.status IN ('CAPTURED','CANCELLED')),0) AS "totalSpent",
          s.joined_at AT TIME ZONE 'UTC' AS "joinedAt",s.last_activity AT TIME ZONE 'UTC' AS "lastActivityAt"
        FROM page s LEFT JOIN public.profiles p ON p.id::text=s.user_id
        LEFT JOIN auth.users u ON u.id=p.id
      ) row_data),'[]'::jsonb) AS items`;
  return toPage(
    (result?.items ?? []).map((row) => ({
      ...row,
      joinedAt: new Date(row.joinedAt),
      lastActivityAt: new Date(row.lastActivityAt),
    })),
    result?.total ?? 0,
    window,
  );
}
