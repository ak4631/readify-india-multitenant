"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Facility } from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import { setVendorFacilities } from "@/server/actions/vendor-facilities.actions";

export function VendorFacilitiesEditor({
  vendorId,
  allFacilities,
  selectedFacilityIds,
}: {
  vendorId: string;
  allFacilities: Facility[];
  selectedFacilityIds: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState(new Set(selectedFacilityIds));
  const canEdit = usePermission("vendor.update");

  function toggle(facilityId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(facilityId)) {
        next.delete(facilityId);
      } else {
        next.add(facilityId);
      }
      return next;
    });
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await setVendorFacilities(vendorId, Array.from(selected));
        toast.success("Facilities updated");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Update failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {allFacilities.map((facility) => (
          <Label
            key={facility.id}
            className="flex items-center gap-2 font-normal"
          >
            <Checkbox
              checked={selected.has(facility.id)}
              onCheckedChange={() => toggle(facility.id)}
              disabled={!canEdit}
            />
            {facility.name}
          </Label>
        ))}
        {allFacilities.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No active facilities defined yet.
          </p>
        )}
      </div>
      {canEdit && (
        <Button onClick={handleSave} disabled={isPending} aria-busy={isPending}>
          {isPending ? "Saving..." : "Save Facilities"}
        </Button>
      )}
    </div>
  );
}
