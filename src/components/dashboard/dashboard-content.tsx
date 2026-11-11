"use client";
import Link from "next/link";
import { useDashboardMetrics } from "@/hooks/use-dashboard-metrics";
import type { DashboardMetrics } from "@/server/actions/dashboard.actions";

export function DashboardContent({
  initialData,
}: {
  initialData: DashboardMetrics;
}) {
  const { data, error, isFetching } = useDashboardMetrics(initialData);
  const metrics = [
    ["Live listings", data.activeVendors, "/partners"],
    ["Live partner organizations", data.activePartners, "/partners"],
    ["Total listings", data.totalVendors, "/partners"],
    ["Staff accounts", data.totalUsers, "/users"],
  ];
  const actions = [
    ["Partner applications", data.pendingPartners, "applications"],
    [
      "Listings awaiting review or publication",
      data.pendingVendors,
      "listings",
    ],
    ["Submitted revisions", data.pendingRevisions, "changes"],
    ["Documents to verify", data.pendingDocuments, "documents"],
    ["Rejected listings", data.rejectedVendors, "issues"],
    ["Suspended listings", data.suspendedVendors, "issues"],
    ["Open support tickets", data.openSupport, "support"],
    ["Pending refunds", data.pendingRefunds, "refunds"],
  ];
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground" role="status">
        {error
          ? "Refresh failed. Showing the last loaded figures."
          : isFetching
            ? "Refreshing platform figures…"
            : "Figures refresh every 30 seconds while this view is open."}{" "}
        Live totals include only active approved partners and enabled services.
      </p>
      <section
        aria-label="Platform totals"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {metrics.map(([label, value, href]) => (
          <Link
            key={label}
            href={String(href)}
            className="rounded-lg border bg-card p-5 hover:bg-muted"
          >
            <span className="text-sm text-muted-foreground">{label}</span>
            <strong className="mt-3 block text-3xl font-semibold">
              {value}
            </strong>
          </Link>
        ))}
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Needs attention</h2>
          <Link href="/approvals" className="text-sm text-primary underline">
            Open action queues
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {actions.map(([label, value, kind]) => (
            <Link
              key={label}
              href={`/approvals?kind=${kind}`}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4 hover:bg-muted"
            >
              <span className="text-sm">{label}</span>
              <strong className="text-2xl">{value}</strong>
            </Link>
          ))}
        </div>
      </section>
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-xl font-semibold">Live services</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Published listings customers can discover, grouped by service.
        </p>
        <ul className="mt-4 divide-y">
          {data.categoryDistribution.map((row) => (
            <li key={row.category} className="flex justify-between gap-3 py-3">
              <span>{row.category}</span>
              <strong>{row.count}</strong>
            </li>
          ))}
        </ul>
        {!data.categoryDistribution.length && (
          <p className="mt-4">No services are live yet.</p>
        )}
      </section>
      <section className="rounded-lg border p-5">
        <h2 className="font-semibold">Partner operations</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Open an organization to manage its listings, plans, bookings,
          customers, services, payments, team and approvals. Platform-wide
          management controls remain available.
        </p>
        <Link
          href="/partners"
          className="mt-4 inline-block text-primary underline"
        >
          Browse partner workspaces
        </Link>
      </section>
    </div>
  );
}
