import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { PageHeader } from "@/components/layout/page-header";
import { getDashboardMetrics } from "@/server/actions/dashboard.actions";

export default async function DashboardPage() {
  const metrics = await getDashboardMetrics();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Admin Dashboard"
        title="Welcome to Readify India"
        description="Manage partner onboarding, listing approvals, users, and reviews for the marketplace."
      />
      <DashboardContent initialData={metrics} />
    </div>
  );
}
