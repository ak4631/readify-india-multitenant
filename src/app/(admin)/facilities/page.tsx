import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FacilityFormDialog } from "@/components/facilities/facility-form-dialog";
import { FacilityTable } from "@/components/facilities/facility-table";
import { listFacilities } from "@/server/actions/facilities.actions";

export default async function FacilitiesPage() {
  const facilities = await listFacilities();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Catalog"
        title="Facilities"
        description={`${facilities.length} amenities that can be mapped to any vendor.`}
        actions={<FacilityFormDialog trigger={<Button>Add facility</Button>} />}
      />
      <Card>
        <CardContent>
          <FacilityTable facilities={facilities} />
        </CardContent>
      </Card>
    </div>
  );
}
