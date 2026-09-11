import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { PartnerFormDialog } from "@/components/partners/partner-form-dialog";
import { PartnerTable } from "@/components/partners/partner-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentSession, hasPermission } from "@/lib/rbac";
import { listPartners } from "@/server/actions/partners.actions";

export default async function PartnersPage() {
  const [partners, session] = await Promise.all([
    listPartners(),
    getCurrentSession(),
  ]);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Organizations"
        title="Partners"
        description={`${partners.length} partner organizations on the platform.`}
        actions={
          hasPermission(session, "partner.create") ? (
            <PartnerFormDialog
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Create partner
                </Button>
              }
            />
          ) : undefined
        }
      />
      <Card>
        <CardContent>
          <PartnerTable partners={partners} />
        </CardContent>
      </Card>
    </div>
  );
}
