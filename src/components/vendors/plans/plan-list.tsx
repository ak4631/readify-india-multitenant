"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanFormDialog } from "@/components/vendors/plans/plan-form-dialog";
import type { MembershipPlan } from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import { archiveMembershipPlan } from "@/server/actions/membership-plans.actions";

export function PlanList({
  vendorId,
  plans,
}: {
  vendorId: string;
  plans: MembershipPlan[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canEdit = usePermission("vendor.update");

  function handleArchive(planId: string) {
    startTransition(async () => {
      try {
        await archiveMembershipPlan(planId);
        toast.success("Plan archived");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      {canEdit && (
        <PlanFormDialog
          vendorId={vendorId}
          trigger={<Button>+ Add Plan</Button>}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>{plan.name}</CardTitle>
                <p className="text-muted-foreground text-sm">
                  ₹{Number(plan.price).toLocaleString()} / {plan.durationValue}{" "}
                  {plan.durationUnit.toLowerCase()}
                  {plan.dailyHours ? ` · ${plan.dailyHours}h/day` : ""}
                </p>
              </div>
              <Badge
                variant={plan.status === "ACTIVE" ? "default" : "secondary"}
              >
                {plan.status}
              </Badge>
            </CardHeader>
            <CardContent className="flex gap-2">
              {canEdit && (
                <>
                  <PlanFormDialog
                    vendorId={vendorId}
                    plan={plan}
                    trigger={
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                    }
                  />
                  {plan.status !== "ARCHIVED" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      aria-busy={isPending}
                      onClick={() => handleArchive(plan.id)}
                    >
                      Archive
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}
        {plans.length === 0 && (
          <p className="text-muted-foreground text-sm">No plans yet.</p>
        )}
      </div>
    </div>
  );
}
