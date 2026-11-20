"use client";
import Link from "next/link";
import { MembershipVerification } from "@/components/subscriptions/membership-verification";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    <section className="min-w-0 space-y-4 rounded-xl border bg-card p-5">
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
      {!data.items.length ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No pending payments match your filters.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {[
                "Customer",
                "Listing",
                "Plan / type",
                "Booking ID",
                "Amount",
                "Payment method",
                "Deadline",
              ].map((label) => (
                <TableHead key={label}>{label}</TableHead>
              ))}
              {canVerify && <TableHead>Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  {row.customerName}
                </TableCell>
                <TableCell>{row.vendorName}</TableCell>
                <TableCell>
                  {row.planName}
                  <p className="text-xs text-muted-foreground">
                    {row.kind === "subscription"
                      ? "Subscription"
                      : "Day / Flex booking"}
                  </p>
                </TableCell>
                <TableCell>
                  <code className="select-all">{row.bookingCode}</code>
                </TableCell>
                <TableCell>₹{(row.amountPaise / 100).toFixed(2)}</TableCell>
                <TableCell>
                  {row.paymentMethod === "OFFLINE"
                    ? "Pay at Partner"
                    : "Online payment pending"}
                </TableCell>
                <TableCell>
                  {new Date(row.expiresAt).toLocaleString("en-IN", {
                    timeZone: row.timeZone,
                  })}
                </TableCell>
                {canVerify && (
                  <TableCell>
                    <MembershipVerification targetId={row.targetId} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
