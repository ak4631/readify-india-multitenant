"use client";
import Link from "next/link";
import { MembershipVerification } from "@/components/subscriptions/membership-verification";
import { usePermission } from "@/hooks/use-permission";
import type { listPendingPayments } from "@/server/actions/pending-payments.actions";
export function PendingPayments({
  data,
  viewAllHref,
}: {
  data: Awaited<ReturnType<typeof listPendingPayments>>;
  viewAllHref?: string;
}) {
  const canVerify = usePermission("vendor.update");
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Payment Pending{" "}
          <span className="text-muted-foreground">({data.total})</span>
        </h2>
        {viewAllHref && (
          <Link href={viewAllHref} className="text-sm text-primary underline">
            View all pending payments
          </Link>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Unpaid bookings, including subscriptions. Earliest payment deadlines
        appear first.
      </p>
      {!data.items.length && (
        <p className="text-sm text-muted-foreground">No pending payments.</p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {data.items.map((row) => (
          <article key={row.id} className="space-y-2 rounded-lg border p-4">
            <p className="font-semibold">
              {row.customerName} · {row.vendorName}
            </p>
            <p className="text-sm">
              {row.planName} ·{" "}
              {row.kind === "subscription"
                ? "Subscription"
                : "Day / Flex booking"}
            </p>
            <p className="text-sm">
              Booking ID:{" "}
              <code className="select-all break-all">{row.bookingCode}</code>
            </p>
            <p className="font-medium">
              ₹{(row.amountPaise / 100).toFixed(2)} ·{" "}
              {row.paymentMethod === "OFFLINE"
                ? "Pay at Partner"
                : "Online payment pending"}
            </p>
            <p className="text-sm text-muted-foreground">
              Payment deadline:{" "}
              {new Date(row.expiresAt).toLocaleString("en-IN", {
                timeZone: row.timeZone,
              })}
            </p>
            {canVerify && <MembershipVerification targetId={row.targetId} />}
          </article>
        ))}
      </div>
    </section>
  );
}
