import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/rbac";
import { getOwnerControlPanel } from "@/server/actions/workspace.actions";
import { PageHeader } from "@/components/layout/page-header";
import { WorkspaceSummary } from "@/components/dashboard/workspace-summary";

export default async function ControlPanelPage() {
  const session = await getCurrentSession();
  if (
    !session?.user?.roles.includes("PARTNER_ADMIN") ||
    session.user.roles.includes("PARTNER_EMPLOYEE")
  )
    redirect("/403");
  const data = await getOwnerControlPanel();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Owner Control Panel"
        description="Verified payments, bookings, active memberships and physical attendance for your organization."
      />
      <WorkspaceSummary data={data} />
    </div>
  );
}
