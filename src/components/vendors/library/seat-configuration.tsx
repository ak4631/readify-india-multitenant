"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SeatTypeFormDialog } from "@/components/vendors/library/seat-type-form-dialog";
import type { LibrarySeatType } from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import { deleteLibrarySeatType } from "@/server/actions/library-seat-types.actions";

export function SeatConfiguration({
  vendorId,
  seatTypes,
}: {
  vendorId: string;
  seatTypes: LibrarySeatType[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canEdit = usePermission("vendor.update");
  const total = seatTypes.reduce((sum, s) => sum + s.totalCount, 0);

  function handleDelete(seatTypeId: string) {
    startTransition(async () => {
      try {
        await deleteLibrarySeatType(seatTypeId);
        toast.success("Seat type removed");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {total} total seat{total === 1 ? "" : "s"} across {seatTypes.length}{" "}
          type
          {seatTypes.length === 1 ? "" : "s"}
        </p>
        {canEdit && (
          <SeatTypeFormDialog
            vendorId={vendorId}
            trigger={<Button>+ Add Seat Type</Button>}
          />
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {seatTypes.map((seatType) => (
          <Card key={seatType.id}>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{seatType.name}</p>
                <p className="text-sm text-muted-foreground">
                  {seatType.totalCount} seats
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <SeatTypeFormDialog
                    vendorId={vendorId}
                    seatType={seatType}
                    trigger={
                      <Button variant="ghost" size="sm">
                        Edit
                      </Button>
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    aria-busy={isPending}
                    onClick={() => handleDelete(seatType.id)}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {seatTypes.length === 0 && (
          <p className="text-muted-foreground col-span-full text-sm">
            No seat types configured yet.
          </p>
        )}
      </div>
    </div>
  );
}
