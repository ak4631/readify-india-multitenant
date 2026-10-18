import { PageHeader } from "@/components/layout/page-header";
import { PartnerTeamTable } from "@/components/partners/partner-team-table";
import { PartnerUserDialog } from "@/components/partners/partner-user-dialog";
import { Button } from "@/components/ui/button";
import { listPartnerUsers } from "@/server/actions/partners.actions";
import {
  requirePermission,
  getSessionPartnerId,
  hasPermission,
} from "@/lib/rbac";

export default async function TeamPage() {
  const session = await requirePermission("partnerUser.read");
  const partnerId = await getSessionPartnerId(session);
  if (!partnerId)
    return (
      <PageHeader
        title="Team Members"
        description="Manage a partner's team from its organization page."
      />
    );
  const users = await listPartnerUsers(partnerId);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Team Members"
        description="Manage your organization's roles and access. Deactivation blocks the next authenticated request."
        actions={
          hasPermission(session, "partnerUser.createEmployee") ? (
            <PartnerUserDialog
              partnerId={partnerId}
              allowAdmin={hasPermission(session, "partnerUser.createAdmin")}
              trigger={<Button>Add team member</Button>}
            />
          ) : undefined
        }
      />
      <PartnerTeamTable users={users} />
    </div>
  );
}
