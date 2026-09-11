"use client";

import Link from "next/link";
import { CategoryDistribution } from "@/components/dashboard/category-distribution";
import { MetricCard } from "@/components/dashboard/metric-card";
import { RecentVendorsTable } from "@/components/dashboard/recent-vendors-table";
import { Button } from "@/components/ui/button";
import { useDashboardMetrics } from "@/hooks/use-dashboard-metrics";
import type { DashboardMetrics } from "@/server/actions/dashboard.actions";
import { Plus, ShieldCheck } from "lucide-react";

export function DashboardContent({
  initialData,
}: {
  initialData: DashboardMetrics;
}) {
  const { data } = useDashboardMetrics(initialData);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-lg border border-primary/20 bg-[linear-gradient(135deg,var(--color-accent-soft),var(--color-surface)_62%)] p-5 shadow-[0_18px_50px_oklch(0.26_0.03_170_/_0.07)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-4">
            <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-primary">
                Admin workspace active
              </p>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-foreground/80">
                Review vendors, approvals, and marketplace activity from one
                place. Live booking and revenue detail will appear here as those
                modules come online.
              </p>
            </div>
          </div>
          <span className="inline-flex w-fit shrink-0 items-center rounded-full border border-primary/20 bg-card px-3 py-1.5 font-mono text-xs font-semibold text-primary">
            Admin workspace
          </span>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-6 sm:p-7">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold tracking-[0.08em] text-primary uppercase">
                Operations overview
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                Marketplace snapshot
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Track vendor volume, pending reviews, users, and bookings across
                Library, Gym, Study Cafe, and Exam Hub.
              </p>
            </div>
            <Button
              nativeButton={false}
              render={
                <Link href="/vendors/new">
                  <Plus className="size-4" aria-hidden="true" />
                  Add listing
                </Link>
              }
            />
          </div>
        </div>
        <div className="grid gap-4 p-6 sm:grid-cols-2 sm:p-7 xl:grid-cols-4">
          <MetricCard
            label="Listings"
            value={data.totalVendors}
            description="All partner listings in the system"
          />
          <MetricCard
            label="Pending"
            value={data.pendingVendors}
            description="Submitted or under review"
          />
          <MetricCard
            label="Users"
            value={data.totalUsers}
            description="Registered accounts"
          />
          <MetricCard
            label="Bookings"
            value={data.totalBookings}
            description="All booking records"
          />
        </div>
        <div className="grid gap-4 border-t border-border p-6 sm:grid-cols-2 sm:p-7 xl:grid-cols-2">
          <MetricCard
            label="Published"
            value={data.activeVendors}
            description="Live partner listings on the marketplace"
          />
          <MetricCard
            label="Rejected"
            value={data.rejectedVendors}
            description="Listings sent back to draft"
          />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryDistribution data={data.categoryDistribution} />
        <RecentVendorsTable vendors={data.recentVendors} />
      </div>
    </div>
  );
}
