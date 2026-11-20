import { Prisma } from "@/generated/prisma/client";

export type BookingListFilters = {
  partnerId?: string;
  vendorId?: string;
  q?: string;
  status?: string;
  date?: string;
  page?: number;
};

// Apply tenant scope and filters before counting or paginating either source.
export function bookingListQuery(
  ids: string[] | null,
  filters: BookingListFilters,
) {
  const q = filters.q?.trim() ?? "";
  const status = filters.status ?? "all";
  return Prisma.sql`
    WITH entries AS (
      SELECT b.id, b.vendor_id, b.user_id, b.booking_code, b.created_at,
        b.booking_date::date AS for_date, b.status::text, b.amount,
        s.label AS seat_label, coalesce(p.name,b.seat_label,'—') AS plan_name,
        CASE WHEN b.start_at IS NOT NULL AND b.end_at IS NOT NULL
          THEN to_char(b.start_at AT TIME ZONE v.time_zone,'HH24:MI') || ' – ' || to_char(b.end_at AT TIME ZONE v.time_zone,'HH24:MI')
          ELSE coalesce(b.time_label,'—') END AS slot_label,
        b.duration_hours AS hours, v.name AS vendor_name, v.time_zone
      FROM admin.bookings b JOIN admin.vendors v ON v.id=b.vendor_id
      LEFT JOIN admin.library_seats s ON s.id=b.seat_id
      LEFT JOIN admin.membership_plans p ON p.id=b.plan_id
      UNION ALL
      SELECT f.id,f.vendor_id,f.user_id,f.booking_code,f.created_at,
        f.start_date,f.status::text,f.amount,s.label,'Flex Booking',
        to_char(f.slot_start,'HH24:MI') || ' · ' || f.slot_hours || 'h/day · ' || f.days || ' days',
        f.slot_hours*f.days,v.name,v.time_zone
      FROM admin.flex_bookings f JOIN admin.vendors v ON v.id=f.vendor_id
      LEFT JOIN admin.library_seats s ON s.id=f.seat_id
    ), filtered AS (
      SELECT e.*, coalesce(p.full_name,'Customer') AS customer_name,u.email AS customer_email
      FROM entries e
      LEFT JOIN public.profiles p ON p.id::text=e.user_id
      LEFT JOIN auth.users u ON u.id=p.id
      WHERE (${ids}::text[] IS NULL OR e.vendor_id=ANY(${ids}::text[]))
        AND (${filters.vendorId || null}::text IS NULL OR e.vendor_id=${filters.vendorId || null})
        AND (${filters.date || null}::text IS NULL OR e.for_date::text=${filters.date || null})
        AND (${q}='' OR strpos(lower(concat_ws(' ',e.id,e.booking_code,e.vendor_name,p.full_name,u.email)),lower(${q}))>0)
        AND (${status}='all'
          OR (${status}='today' AND e.for_date=(now() AT TIME ZONE e.time_zone)::date)
          OR (${status}='upcoming' AND e.for_date>=(now() AT TIME ZONE e.time_zone)::date AND e.status IN ('PENDING','CONFIRMED'))
          OR e.status=upper(${status}))
    )`;
}
