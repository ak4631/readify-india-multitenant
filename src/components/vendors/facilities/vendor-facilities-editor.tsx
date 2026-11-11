"use client";

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
  readOnly = false,
}: {
  vendorId: string;
  allFacilities: Facility[];
  selectedFacilityIds: string[];
  readOnly?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState(new Set(selectedFacilityIds));
  const selectionVersion = JSON.stringify([...selectedFacilityIds].sort());
  const [previousSelectionVersion, setPreviousSelectionVersion] =
    useState(selectionVersion);
  if (selectionVersion !== previousSelectionVersion) {
    setPreviousSelectionVersion(selectionVersion);
    setSelected(new Set(selectedFacilityIds));
  }
  const canEdit = usePermission("vendor.update") && !readOnly;

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

  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  function handleSave() {
    setSaveMessage(null);
    startTransition(async () => {
      try {
        const result = await setVendorFacilities(
          vendorId,
          Array.from(selected),
        );
        if (!result.ok) {
          toast.error(result.message);
          setSaveMessage(result.message);
          return;
        }
        const message =
          result.outcome === "queued"
            ? "Proposed facilities saved. Open Changes to submit for Super Admin approval. Customers still see the approved facilities."
            : "Draft facilities saved.";
        setSaveMessage(message);
        toast.success(message);
        // revalidatePath in the action already returns the refreshed server tree.
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
              disabled={!canEdit || isPending}
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
      {saveMessage && (
        <p role="status" className="text-sm text-muted-foreground">
          {saveMessage}
        </p>
      )}
      {canEdit && (
        <Button onClick={handleSave} disabled={isPending} aria-busy={isPending}>
          {isPending ? "Saving..." : "Save Facilities"}
        </Button>
      )}
    </div>
  );
}
