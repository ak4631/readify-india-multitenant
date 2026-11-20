"use client";

import Link from "next/link";
import { MembershipVerification } from "@/components/subscriptions/membership-verification";
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
import { usePermission } from "@/hooks/use-permission";
import type { VendorBookingRow } from "@/server/actions/bookings.actions";
import { cancelLibraryBooking as serverAction_cancelLibraryBooking } from "@/server/actions/library-occupancy.actions";
import { actionClient } from "@/lib/action-client";

const cancelLibraryBooking = actionClient(serverAction_cancelLibraryBooking);

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive"> =
  {
    PENDING: "secondary",
    CONFIRMED: "default",
    COMPLETED: "default",
    CANCELLED: "destructive",
    EXPIRED: "secondary",
  };

function formatPlaced(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatForDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function BookingTable({
  bookings,
  showListing = false,
}: {
  bookings: VendorBookingRow[];
  showListing?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canManage = usePermission("vendor.update");

  function handleCancel(bookingId: string) {
    startTransition(async () => {
      try {
        await cancelLibraryBooking(bookingId);
        toast.success("Booking cancelled");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  if (!bookings.length)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No bookings match your filters.
      </p>
    );

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {showListing && <TableHead>Listing</TableHead>}
            <TableHead>Customer</TableHead>
            <TableHead>Placed on</TableHead>
            <TableHead>Booked for</TableHead>
            <TableHead>Seat &amp; slot</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            {canManage && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <TableRow key={b.id}>
              {showListing && (
                <TableCell>
                  <Link
                    className="font-medium text-primary hover:underline"
                    href={`/vendors/${b.vendorId}?tab=bookings`}
                  >
                    {b.vendorName}
                  </Link>
                </TableCell>
              )}
              <TableCell>
                <p className="font-medium">{b.customerName}</p>
                <p className="text-xs text-muted-foreground">
                  {b.customerEmail ?? ""}
                  {b.bookingCode && (
                    <span className="block font-mono">{b.bookingCode}</span>
                  )}
                </p>
              </TableCell>
              <TableCell>{formatPlaced(b.placedOn)}</TableCell>
              <TableCell>{formatForDate(b.forDate)}</TableCell>
              <TableCell>
                {b.seatLabel && <p className="font-medium">{b.seatLabel}</p>}
                <p className="text-xs text-muted-foreground">
                  {b.slotLabel}
                  {b.hours ? ` (${b.hours}h)` : ""}
                </p>
              </TableCell>
              <TableCell>{b.planName}</TableCell>
              <TableCell>₹{b.amount.toLocaleString("en-IN")}</TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANTS[b.status] ?? "secondary"}>
                  {b.status}
                </Badge>
              </TableCell>
              {canManage && (
                <TableCell className="text-right">
                  {["PENDING", "CONFIRMED"].includes(b.status) && (
                    <MembershipVerification targetId={b.id} />
                  )}
                  {(b.status === "PENDING" || b.status === "CONFIRMED") && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      aria-busy={isPending}
                      onClick={() => handleCancel(b.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
