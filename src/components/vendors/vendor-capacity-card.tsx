"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePermission } from "@/hooks/use-permission";
import { updateVendorCapacity } from "@/server/actions/vendors.actions";

const DEFAULT_CAPACITY = 20;

export function VendorCapacityCard({
  vendorId,
  capacity,
}: {
  vendorId: string;
  capacity: number | null;
}) {
  const router = useRouter();
  const canEdit = usePermission("vendor.update");
  const [value, setValue] = useState(capacity != null ? String(capacity) : "");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const trimmed = value.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed != null && (!Number.isInteger(parsed) || parsed <= 0)) {
      toast.error("Capacity must be a whole number greater than 0");
      return;
    }

    startTransition(async () => {
      try {
        await updateVendorCapacity(vendorId, { capacity: parsed });
        toast.success("Capacity updated");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Update failed");
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <div>
          <p className="text-sm font-semibold">Capacity</p>
          <p className="text-sm text-muted-foreground">
            How many customers can hold an active booking or subscription at the same
            time. Leave blank to use the default of {DEFAULT_CAPACITY}.
          </p>
        </div>
        {canEdit ? (
          <div className="flex items-end gap-3">
            <div className="w-40">
              <Label htmlFor="vendor-capacity">Capacity</Label>
              <Input
                id="vendor-capacity"
                type="number"
                min={1}
                placeholder={String(DEFAULT_CAPACITY)}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <Button onClick={handleSave} disabled={isPending} aria-busy={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        ) : (
          <p className="text-sm font-medium">{capacity ?? DEFAULT_CAPACITY}</p>
        )}
      </CardContent>
    </Card>
  );
}
