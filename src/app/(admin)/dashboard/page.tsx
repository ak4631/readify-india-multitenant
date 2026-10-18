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
    return (
      <div className="space-y-6">
        <PageHeader
          title="Library Dashboard"
          description="Your listings, bookings, physical attendance and verified payments."
        />
        <WorkspaceSummary data={await getWorkspaceSummary()} />
      </div>
    );
  }
  const metrics = await getDashboardMetrics();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin Dashboard"
        title="Welcome to Vriddhora"
        description="Manage partner onboarding, listing approvals, users, and reviews for the marketplace."
      />
      <DashboardContent initialData={metrics} />
    </div>
  );
}
