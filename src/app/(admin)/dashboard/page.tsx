import { PendingPayments } from "@/components/subscriptions/pending-payments";
import { listPendingPayments } from "@/server/actions/pending-payments.actions";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { PageHeader } from "@/components/layout/page-header";
import { getDashboardMetrics } from "@/server/actions/dashboard.actions";
import { getCurrentSession } from "@/lib/rbac";
import { WorkspaceSummary } from "@/components/dashboard/workspace-summary";
import { getWorkspaceSummary } from "@/server/actions/workspace.actions";

export default async function DashboardPage() {
  const session = await getCurrentSession();
  if (
    session?.user.roles.some((role) =>
      ["PARTNER_ADMIN", "PARTNER_EMPLOYEE"].includes(role),
    )
  ) {
    const [summary, pending] = await Promise.all([
      getWorkspaceSummary(),
      listPendingPayments({ pageSize: 5 }),
    ]);
    return (
      <div className="space-y-6">
        <PageHeader
          title="Partner Dashboard"
          description="Your listings, bookings, physical attendance and verified payments."
        />
        <PendingPayments
          data={pending}
          viewAllHref="/payments?status=pending"
        />
        <WorkspaceSummary data={summary} />
      </div>
    );
  }
  const metrics = await getDashboardMetrics();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Platform overview"
        title="Platform status and pending actions"
        description="Manage partner onboarding, listing approvals, users, and reviews for the marketplace."
      />
      <DashboardContent initialData={metrics} />
    </div>
  );
}
