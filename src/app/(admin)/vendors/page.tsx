import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { VendorFilters } from "@/components/vendors/vendor-filters";
import { VendorTable } from "@/components/vendors/vendor-table";
import type { VendorStatus } from "@/generated/prisma/enums";
import { listVendorCategories } from "@/server/actions/vendor-categories.actions";
import { listVendorsPage } from "@/server/actions/vendors.actions";
import { ListPagination } from "@/components/layout/list-pagination";
import { parsePage } from "@/lib/pagination";
import { getCurrentSession, hasPermission, isSuperAdmin } from "@/lib/rbac";

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    categoryId?: string;
    status?: string;
    city?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const session = await getCurrentSession();
  const [vendors, categories] = await Promise.all([
    listVendorsPage({
      categoryId: params.categoryId,
      status: params.status as VendorStatus | undefined,
      city: params.city,
      page: parsePage(params.page),
    }),
    listVendorCategories(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Partners"
        title="Partner listings"
        description={`${vendors.total} listings across Library, Gym, Co-working Space, and Exam Hub.`}
        actions={
          hasPermission(session, "vendor.create") && session ? (
            <Button
              nativeButton={false}
              render={
                <Link
                  href={isSuperAdmin(session) ? "/partners" : "/vendors/new"}
                >
                  {isSuperAdmin(session) ? "Manage partners" : "Add listing"}
                </Link>
              }
            />
          ) : undefined
        }
      />
      <Card>
        <CardContent className="space-y-5">
          <VendorFilters categories={categories} />
          <VendorTable vendors={vendors.items} />
          <ListPagination
            page={vendors}
            path="/vendors"
            params={params}
            noun="listings"
          />
        </CardContent>
      </Card>
    </div>
  );
}
