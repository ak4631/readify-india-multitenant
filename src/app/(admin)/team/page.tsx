import { PageHeader } from "@/components/layout/page-header";
import { ListPagination } from "@/components/layout/list-pagination";
import { PartnerTeamTable } from "@/components/partners/partner-team-table";
import { PartnerUserDialog } from "@/components/partners/partner-user-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { parsePage } from "@/lib/pagination";
import {
  listAllPartnerUsers,
  listPartnerUsers,
} from "@/server/actions/partners.actions";
import {
  requirePermission,
  getSessionPartnerId,
  hasPermission,
} from "@/lib/rbac";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = parsePage(params.page);
  const session = await requirePermission("partnerUser.read");
  const partnerId = await getSessionPartnerId(session);
  if (!partnerId) {
    const users = await listAllPartnerUsers(page);
    return (
      <div className="space-y-6">
        <PageHeader
          title="Team Members"
          description={`${users.total} partner staff accounts across all organizations. To add a member, open the organization from Partners.`}
        />
        <Card>
          <CardContent>
            <PartnerTeamTable users={users.items} showOrganization />
            <ListPagination
              page={users}
              path="/team"
              params={params}
              noun="team members"
            />
          </CardContent>
        </Card>
      </div>
    );
  }
  const users = await listPartnerUsers(partnerId, page);
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
      <Card>
        <CardContent>
          <PartnerTeamTable users={users.items} />
          <ListPagination
            page={users}
            path="/team"
            params={params}
            noun="team members"
          />
        </CardContent>
      </Card>
    </div>
  );
}
