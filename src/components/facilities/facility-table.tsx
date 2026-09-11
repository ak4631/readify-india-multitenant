"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FacilityFormDialog } from "@/components/facilities/facility-form-dialog";
import type { Facility } from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import { deactivateFacility } from "@/server/actions/facilities.actions";

type FacilityRow = Facility & { _count: { vendorFacilities: number } };

export function FacilityTable({ facilities }: { facilities: FacilityRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canUpdate = usePermission("facility.update");
  const canDelete = usePermission("facility.delete");

  function handleDeactivate(facility: FacilityRow) {
    startTransition(async () => {
      try {
        await deactivateFacility(facility.id);
        toast.success(`${facility.name} deactivated`);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Listings using</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {facilities.map((facility) => (
          <TableRow key={facility.id}>
            <TableCell className="font-medium">{facility.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {facility.category ?? "—"}
            </TableCell>
            <TableCell>
              <Badge
                variant={facility.status === "ACTIVE" ? "default" : "secondary"}
              >
                {facility.status}
              </Badge>
            </TableCell>
            <TableCell>{facility._count.vendorFacilities}</TableCell>
            <TableCell className="flex justify-end gap-2">
              {canUpdate && (
                <FacilityFormDialog
                  facility={facility}
                  trigger={
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  }
                />
              )}
              {canDelete && facility.status === "ACTIVE" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleDeactivate(facility)}
                >
                  Deactivate
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
