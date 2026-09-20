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

type SubscriptionRow = Subscription & { vendor?: Vendor; plan?: MembershipPlan };

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
    3 + (showVendor ? 1 : 0) + (showCustomer ? 1 : 0) + (canCancel ? 1 : 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showCustomer && <TableHead>Customer</TableHead>}
          {showVendor && <TableHead>Partner listing</TableHead>}
          <TableHead>Plan</TableHead>
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
