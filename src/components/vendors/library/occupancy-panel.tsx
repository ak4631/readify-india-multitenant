"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePermission } from "@/hooks/use-permission";
import {
  cancelLibraryBooking,
  setLibrarySeatActive,
  type LibraryOccupancy,
  type RevenueRow,
} from "@/server/actions/library-occupancy.actions";
import { cancelSubscription } from "@/server/actions/subscriptions.actions";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const hrs = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}h`;

function Stat({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-4 py-3">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function RevenueTable({ title, rows }: { title: string; rows: RevenueRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No revenue yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{title.includes("plan") ? "Plan" : "Slot"}</TableHead>
                <TableHead className="text-right">Bookings</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>{row.key}</TableCell>
                  <TableCell className="text-right">{row.count}</TableCell>
                  <TableCell className="text-right">{inr(row.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function LibraryOccupancyPanel({ data }: { data: LibraryOccupancy }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canManage = usePermission("vendor.update");
  const canCancelSubscription = usePermission("subscription.cancel");

  function run(action: () => Promise<void>, success: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(success);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  const { summary } = data;
  const rows = data.seats.flatMap((seat) =>
    seat.intervals.map((interval) => ({ seat, interval })),
  );

  return (
    <div className="space-y-6" aria-busy={isPending}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Seat availability by time</p>
          <p className="text-sm text-muted-foreground">
            {data.closed
              ? "Closed on this date"
              : `Open ${data.openLabel} – ${data.closeLabel} (${hrs(data.totalHoursPerSeat)} per seat) · ${data.timeZone}`}
          </p>
        </div>
        <Input
          type="date"
          className="w-auto"
          value={data.date}
          aria-label="Date"
          onChange={(e) => {
            if (e.target.value) {
              router.push(`?tab=occupancy&date=${e.target.value}`);
            }
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          title="Seats free all day"
          value={`${summary.fullyFreeSeats} / ${summary.activeSeats}`}
          hint={`${summary.partiallyFreeSeats} partly free · ${summary.fullyBookedSeats} full`}
        />
        <Stat
          title="Utilization"
          value={`${summary.utilizationPct}%`}
          hint={`${hrs(summary.occupiedSeatHours)} of ${hrs(summary.totalSeatHours)} seat-hours`}
        />
        <Stat
          title="Active bookings"
          value={String(summary.activeBookings)}
          hint={`${summary.activeSubscriptions} subscription seat${summary.activeSubscriptions === 1 ? "" : "s"}`}
        />
        <Stat
          title={`Revenue · ${data.revenue.periodLabel}`}
          value={inr(data.revenue.total)}
        />
      </div>

      {!data.closed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Seats</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seat</TableHead>
                  <TableHead className="min-w-56">
                    {data.openLabel} → {data.closeLabel}
                  </TableHead>
                  <TableHead>Occupied</TableHead>
                  <TableHead>Free</TableHead>
                  <TableHead>Free windows</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.seats.map((seat) => (
                  <TableRow key={seat.seatId} className={seat.isActive ? "" : "opacity-50"}>
                    <TableCell>
                      <p className="font-medium">{seat.label}</p>
                      {seat.seatType && (
                        <p className="text-xs text-muted-foreground">{seat.seatType}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="relative h-3 w-full overflow-hidden rounded-full bg-emerald-500/25">
                        {seat.intervals.map((i) => (
                          <div
                            key={`${i.source}-${i.refId}`}
                            className={`absolute inset-y-0 ${i.source === "subscription" ? "bg-sky-500" : "bg-primary"}`}
                            style={{
                              left: `${i.startPct}%`,
                              width: `${Math.max(i.endPct - i.startPct, 0.5)}%`,
                            }}
                            title={`${i.startLabel}–${i.endLabel} · ${i.customerName}`}
                          />
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{hrs(seat.occupiedHours)}</TableCell>
                    <TableCell>{hrs(seat.freeHours)}</TableCell>
                    <TableCell className="text-xs">
                      {seat.isActive
                        ? seat.freeWindows.length === 0
                          ? "Fully booked"
                          : seat.freeWindows
                              .map((w) => `${w.startLabel}–${w.endLabel} (${hrs(w.hours)})`)
                              .join(", ")
                        : "Seat disabled"}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            run(
                              () => setLibrarySeatActive(seat.seatId, !seat.isActive),
                              seat.isActive ? "Seat disabled" : "Seat enabled",
                            )
                          }
                        >
                          {seat.isActive ? "Disable" : "Enable"}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              <span className="mr-1 inline-block size-2 rounded-full bg-primary" /> Booking
              <span className="mr-1 ml-3 inline-block size-2 rounded-full bg-sky-500" /> Subscription
              <span className="mr-1 ml-3 inline-block size-2 rounded-full bg-emerald-500/40" /> Free
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Bookings on this day</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bookings for this date.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Seat</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  {(canManage || canCancelSubscription) && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ seat, interval }) => (
                  <TableRow key={`${interval.source}-${interval.refId}`}>
                    <TableCell>
                      <p className="font-medium">{interval.customerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {interval.customerEmail ?? interval.bookingCode ?? ""}
                      </p>
                    </TableCell>
                    <TableCell>{seat.label}</TableCell>
                    <TableCell>
                      {interval.startLabel}–{interval.endLabel} ({hrs(interval.hours)})
                    </TableCell>
                    <TableCell>{interval.planName}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {interval.source === "subscription" ? "Subscription" : "Booking"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge>{interval.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{inr(interval.revenue)}</TableCell>
                    {(canManage || canCancelSubscription) && (
                      <TableCell className="text-right">
                        {interval.source === "booking" && canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() =>
                              run(
                                () => cancelLibraryBooking(interval.refId),
                                "Booking cancelled",
                              )
                            }
                          >
                            Cancel
                          </Button>
                        )}
                        {interval.source === "subscription" && canCancelSubscription && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() =>
                              run(
                                () => cancelSubscription(interval.refId),
                                "Subscription cancelled",
                              )
                            }
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
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <RevenueTable title="Revenue by plan" rows={data.revenue.byPlan} />
        <RevenueTable title="Revenue by time slot" rows={data.revenue.bySlot} />
      </div>
      <p className="text-xs text-muted-foreground">
        Revenue is the plan price for bookings and subscriptions created in the{" "}
        {data.revenue.periodLabel.toLowerCase()} (customer platform fee excluded, cancelled
        excluded).
      </p>
    </div>
  );
}
