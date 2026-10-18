import { Card, CardContent } from "@/components/ui/card";
import { LiveRefresh } from "@/components/layout/live-refresh";
import type { getWorkspaceSummary } from "@/server/actions/workspace.actions";

export function WorkspaceSummary({
  data,
}: {
  data: Awaited<ReturnType<typeof getWorkspaceSummary>>;
}) {
  const metrics = [
    ["Listings", data.listings],
    ["Today's bookings", data.todayBookings],
    ["Check-ins today", data.arrivals],
    ["Check-outs today", data.departures],
    ["Pending listing changes", data.pendingChanges],
    ["Single visits", data.visits],
    ["Flex bookings", data.flex],
    ["Active subscriptions", data.subscriptions],
    ["Checked in now", data.present],
    [
      "Verified payments",
      `₹${(data.capturedPaise / 100).toLocaleString("en-IN")}`,
    ],
    [
      "Processed refunds",
      `₹${(data.refundedPaise / 100).toLocaleString("en-IN")}`,
    ],
  ];
  return (
    <>
      <LiveRefresh />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="font-medium">
        Today: {data.reservedSeatHours.toFixed(1)} of{" "}
        {data.totalSeatHours.toFixed(1)} seat-hours reserved. Each seat&apos;s
        free time ranges are available in Service Management.
      </p>
      <p className="text-sm text-muted-foreground">
        Updates every 10 seconds while this page is visible. Payment totals
        include the ₹6 customer fee; partner commission and payouts are not
        configured.
      </p>
    </>
  );
}
