import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ListPagination } from "@/components/layout/list-pagination";
import { PartnerFormDialog } from "@/components/partners/partner-form-dialog";
import { PartnerTable } from "@/components/partners/partner-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { parsePage } from "@/lib/pagination";
import { getCurrentSession, hasPermission } from "@/lib/rbac";
import { listPartners } from "@/server/actions/partners.actions";

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; approval?: string }>;
}) {
  const params = await searchParams;
  const pendingOnly = params.approval === "pending";
  const [partners, session] = await Promise.all([
    listPartners({
      page: parsePage(params.page),
      approval: pendingOnly ? "PENDING" : undefined,
    }),
    getCurrentSession(),
  ]);
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Organizations"
        title="Partners"
        description={
          pendingOnly
            ? `${partners.total} partner applications awaiting review.`
            : `${partners.total} partner organizations on the platform.`
        }
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
      <div className="flex flex-wrap gap-2">
        <Button
          variant={pendingOnly ? "ghost" : "outline"}
          size="sm"
          nativeButton={false}
          render={<Link href="/partners">All organizations</Link>}
        />
        <Button
          variant={pendingOnly ? "outline" : "ghost"}
          size="sm"
          nativeButton={false}
          render={
            <Link href="/partners?approval=pending">
              Pending review ({partners.pending})
            </Link>
          }
        />
      </div>
      <Card>
        <CardContent>
          <PartnerTable partners={partners.items} />
          <ListPagination
            page={partners}
            path="/partners"
            params={params}
            noun="organizations"
          />
        </CardContent>
      </Card>
    </div>
  );
}
