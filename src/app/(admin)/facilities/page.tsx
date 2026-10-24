import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FacilityFormDialog } from "@/components/facilities/facility-form-dialog";
import { FacilityTable } from "@/components/facilities/facility-table";
import { ListPagination } from "@/components/layout/list-pagination";
import { parsePage } from "@/lib/pagination";
import { listFacilitiesPage } from "@/server/actions/facilities.actions";

export default async function FacilitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const facilities = await listFacilitiesPage(parsePage(params.page));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catalog"
        title="Facilities"
        description={`${facilities.total} amenities that can be mapped to any vendor.`}
        actions={<FacilityFormDialog trigger={<Button>Add facility</Button>} />}
      />
      <Card>
        <CardContent>
          <FacilityTable facilities={facilities.items} />
          <ListPagination
            page={facilities}
            path="/facilities"
            params={params}
            noun="facilities"
          />
        </CardContent>
      </Card>
    </div>
  );
}
