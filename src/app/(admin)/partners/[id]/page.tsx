import Link from "next/link";
import { ArrowLeft, Plus, UserPlus } from "lucide-react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PartnerFormDialog } from "@/components/partners/partner-form-dialog";
import { PartnerTeamTable } from "@/components/partners/partner-team-table";
import { PartnerUserDialog } from "@/components/partners/partner-user-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VendorTable } from "@/components/vendors/vendor-table";
import { getCurrentSession, hasPermission } from "@/lib/rbac";
import {
  getPartnerById,
  listPartnerUsers,
} from "@/server/actions/partners.actions";

export default async function PartnerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getCurrentSession();
  const canViewTeam = hasPermission(session, "partnerUser.read");
  const [partner, users] = await Promise.all([
    getPartnerById(id),
    canViewTeam ? listPartnerUsers(id) : Promise.resolve([]),
  ]);
  if (!partner) notFound();
  const canCreateAdmin = hasPermission(session, "partnerUser.createAdmin");
  const canCreateEmployee = hasPermission(
    session,
    "partnerUser.createEmployee",
  );
  return (
    <div className="space-y-8">
      <Link
        href="/partners"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-4" />
        Back to partners
      </Link>
      <PageHeader
        eyebrow="Partner organization"
        title={partner.name}
        description={
          [partner.email, partner.phone].filter(Boolean).join(" · ") ||
          "No contact details added."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {hasPermission(session, "partner.update") && (
              <PartnerFormDialog
                partner={partner}
                trigger={<Button variant="outline">Edit partner</Button>}
              />
            )}
            {hasPermission(session, "vendor.create") && (
              <Button
                nativeButton={false}
                render={
                  <Link href={`/vendors/new?partnerId=${partner.id}`}>
                    <Plus className="size-4" />
                    Add listing
                  </Link>
                }
              />
            )}
          </div>
        }
      />
      {canViewTeam && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Team</CardTitle>
              {(canCreateAdmin || canCreateEmployee) && (
                <PartnerUserDialog
                  partnerId={partner.id}
                  allowAdmin={canCreateAdmin}
                  trigger={
                    <Button size="sm">
                      <UserPlus className="size-4" />
                      Add team member
                    </Button>
                  }
                />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <PartnerTeamTable users={users} />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Listings</CardTitle>
        </CardHeader>
        <CardContent>
          <VendorTable vendors={partner.vendors} />
        </CardContent>
      </Card>
    </div>
  );
}
