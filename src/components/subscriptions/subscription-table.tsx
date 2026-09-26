"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Subscription, Vendor, MembershipPlan } from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import { cancelSubscription } from "@/server/actions/subscriptions.actions";

type SubscriptionRow = Subscription & {
  vendor?: Vendor;
  plan?: MembershipPlan;
  seat?: { label: string } | null;
};

// slotStartTime is a Postgres TIME (Prisma returns it as a 1970-01-01 UTC
// date), so its UTC time-of-day is the library-local wall-clock time.
function formatDailySlot(subscription: SubscriptionRow) {
  if (!subscription.slotStartTime || !subscription.slotHours) return null;
  const start = subscription.slotStartTime.toISOString().slice(11, 16);
  const [h, m] = start.split(":").map(Number);
  const endMinutes = (h * 60 + m + subscription.slotHours * 60) % (24 * 60);
  const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  return `${start} – ${end} (${subscription.slotHours}h) daily`;
}

const STATUS_VARIANTS: Record<
  Subscription["status"],
  "default" | "secondary" | "destructive"
> = {
  ACTIVE: "default",
  EXPIRED: "secondary",
  CANCELLED: "destructive",
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function SubscriptionTable({
  subscriptions,
  showVendor = false,
  showCustomer = false,
}: {
  subscriptions: SubscriptionRow[];
  showVendor?: boolean;
  showCustomer?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canCancel = usePermission("subscription.cancel");

  function handleCancel(subscriptionId: string) {
    startTransition(async () => {
      try {
        await cancelSubscription(subscriptionId);
        toast.success("Subscription cancelled");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  const columnCount =
    4 + (showVendor ? 1 : 0) + (showCustomer ? 1 : 0) + (canCancel ? 1 : 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showCustomer && <TableHead>Customer</TableHead>}
          {showVendor && <TableHead>Partner listing</TableHead>}
          <TableHead>Plan</TableHead>
          <TableHead>Seat &amp; daily slot</TableHead>
          <TableHead>Start date</TableHead>
          <TableHead>End date</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
          {canCancel && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {subscriptions.map((subscription) => (
          <TableRow key={subscription.id}>
            {showCustomer && (
              <TableCell>{subscription.customerName ?? "—"}</TableCell>
            )}
            {showVendor && (
              <TableCell>
                {subscription.vendorName ?? subscription.vendor?.name}
              </TableCell>
            )}
            <TableCell>{subscription.planName ?? subscription.plan?.name}</TableCell>
            <TableCell>
              {subscription.seat ? (
                <>
                  <p className="font-medium">{subscription.seat.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDailySlot(subscription) ?? "—"}
                  </p>
                </>
              ) : (
                "—"
              )}
            </TableCell>
            <TableCell>{formatDate(subscription.startDate)}</TableCell>
            <TableCell>{formatDate(subscription.endDate)}</TableCell>
            <TableCell>₹{subscription.amountPaid.toString()}</TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANTS[subscription.status]}>
                {subscription.status}
              </Badge>
            </TableCell>
            {canCancel && (
              <TableCell className="text-right">
                {subscription.status === "ACTIVE" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    aria-busy={isPending}
                    onClick={() => handleCancel(subscription.id)}
                  >
                    Cancel
                  </Button>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
        {subscriptions.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={columnCount}
              className="text-muted-foreground text-center"
            >
              No subscriptions yet.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
