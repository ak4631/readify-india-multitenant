"use server";
import {
  paymentListFilters,
  type PaymentListFilters,
} from "@/lib/payment-list-filters";
import { prisma } from "@/lib/prisma";
import { getAccessibleVendorIds, requirePermission } from "@/lib/rbac";
import { pageWindow, toPage } from "@/lib/pagination";

export async function listPendingPayments(
  filters: PaymentListFilters & {
    partnerId?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const session = await requirePermission("subscription.read");
  const vendorIds = await getAccessibleVendorIds(session, filters.partnerId);
  const window = pageWindow(filters.page ?? 1, filters.pageSize);
  const where = {
    AND: await paymentListFilters(filters),
    status: "CREATED",
    cancelledAt: null,
    expiresAt: { gt: new Date() },
    ...(vendorIds ? { vendorId: { in: vendorIds } } : {}),
  };
  const [orders, total] = await Promise.all([
    prisma.paymentOrder.findMany({
      where,
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      skip: window.skip,
      take: window.take,
    }),
    prisma.paymentOrder.count({ where }),
  ]);
  const ids = orders.map((order) => order.id);
  const details = ids.length
    ? await prisma.$queryRaw<
        {
          id: string;
          customerName: string;
          vendorName: string;
          planName: string;
          bookingCode: string;
          timeZone: string;
        }[]
      >`
    SELECT o.id,coalesce(s.customer_name,p.full_name,'Customer') AS "customerName",v.name AS "vendorName",v.time_zone AS "timeZone",
      coalesce(s.plan_name,plan.name,'Booking') AS "planName",
      coalesce(f.booking_code,b.booking_code,'subscription:'||s.id,o.target_id) AS "bookingCode"
    FROM admin.payment_orders o JOIN admin.vendors v ON v.id=o.vendor_id
    LEFT JOIN public.profiles p ON p.id::text=o.user_id
    LEFT JOIN admin.subscriptions s ON s.id=o.target_id AND o.target_type='subscription'
    LEFT JOIN admin.flex_bookings f ON f.id=o.target_id AND o.target_type='flex'
    LEFT JOIN admin.bookings b ON b.id=o.target_id AND o.target_type='visit'
    LEFT JOIN admin.membership_plans plan ON plan.id=coalesce(s.plan_id,f.plan_id,b.plan_id)
    WHERE o.id=ANY(${ids}::text[])`
    : [];
  const byId = new Map(details.map((row) => [row.id, row]));
  return toPage(
    orders.map((order) => ({
      id: order.id,
      targetId: order.targetId,
      kind: order.targetType,
      customerName: byId.get(order.id)?.customerName ?? "Customer",
      vendorName: byId.get(order.id)?.vendorName ?? "Listing",
      planName: byId.get(order.id)?.planName ?? "Booking",
      bookingCode: byId.get(order.id)?.bookingCode ?? order.targetId,
      amountPaise: order.amountPaise,
      paymentMethod: order.paymentMethod,
      timeZone: byId.get(order.id)?.timeZone ?? "Asia/Kolkata",
      expiresAt: order.expiresAt,
      startsAt: order.startsAt,
    })),
    total,
    window,
  );
}
