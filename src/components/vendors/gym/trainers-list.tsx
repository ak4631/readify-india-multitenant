"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrainerDetailDialog } from "@/components/vendors/gym/trainer-detail-dialog";
import { TrainerFormDialog } from "@/components/vendors/gym/trainer-form-dialog";
import type {
  Trainer,
  TrainerAvailability,
  TrainerPricing,
  TrainerSpecialization,
  TrainerSpecializationMap,
} from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import { deactivateTrainer } from "@/server/actions/trainers.actions";

type TrainerRow = Trainer & {
  specializations: (TrainerSpecializationMap & {
    specialization: TrainerSpecialization;
  })[];
  pricing: TrainerPricing[];
  availability: TrainerAvailability[];
};

export function TrainersList({
  vendorId,
  trainers,
  allSpecializations,
}: {
  vendorId: string;
  trainers: TrainerRow[];
  allSpecializations: TrainerSpecialization[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canEdit = usePermission("vendor.update");

  function handleDeactivate(trainerId: string) {
    startTransition(async () => {
      try {
        await deactivateTrainer(trainerId);
        toast.success("Trainer deactivated");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <TrainerFormDialog
          vendorId={vendorId}
          trigger={<Button>+ Add Trainer</Button>}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {trainers.map((trainer) => (
          <Card key={trainer.id}>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>{trainer.name}</CardTitle>
                {trainer.experienceYears != null && (
                  <p className="text-muted-foreground text-sm">
                    {trainer.experienceYears} yrs experience
                  </p>
                )}
              </div>
              <Badge
                variant={trainer.status === "ACTIVE" ? "default" : "secondary"}
              >
                {trainer.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {trainer.bio && (
                <p className="text-sm text-muted-foreground">{trainer.bio}</p>
              )}
              <div className="flex flex-wrap gap-1">
                {trainer.specializations.map((s) => (
                  <Badge key={s.specializationId} variant="outline">
                    {s.specialization.name}
                  </Badge>
                ))}
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <TrainerFormDialog
                    vendorId={vendorId}
                    trainer={trainer}
                    trigger={
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    }
                  />
                  <TrainerDetailDialog
                    trainer={trainer}
                    allSpecializations={allSpecializations}
                    trigger={
                      <Button variant="outline" size="sm">
                        Manage
                      </Button>
                    }
                  />
                  {trainer.status === "ACTIVE" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      aria-busy={isPending}
                      onClick={() => handleDeactivate(trainer.id)}
                    >
                      Deactivate
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {trainers.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No trainers added yet.
          </p>
        )}
      </div>
    </div>
  );
}
