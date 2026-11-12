"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanFormDialog } from "@/components/vendors/plans/plan-form-dialog";
import { usePermission } from "@/hooks/use-permission";
import {
  archiveMembershipPlan as serverAction_archiveMembershipPlan,
  type PlanRow,
} from "@/server/actions/membership-plans.actions";
import { actionClient } from "@/lib/action-client";

const archiveMembershipPlan = actionClient(serverAction_archiveMembershipPlan);

export function PlanList({
  vendorId,
  plans,
}: {
  vendorId: string;
  plans: PlanRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const canEdit = usePermission("vendor.update");

  function handleArchive(planId: string) {
    startTransition(async () => {
      try {
        await archiveMembershipPlan(planId);
        toast.success(
          "Saved. Changes to approved listings must be submitted from Changes.",
        );
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
                  {plan.isFlexible ? (
                    <>
                      ₹{Number(plan.price).toLocaleString()}/hr ·{" "}
                      {plan.dailyHours}h/day · customer picks 1-14 days
                    </>
                  ) : (
                    <>
                      ₹{Number(plan.price).toLocaleString()} /{" "}
                      {plan.durationValue} {plan.durationUnit.toLowerCase()}
                      {plan.dailyHours ? ` · ${plan.dailyHours}h/day` : ""}
                    </>
                  )}
                </p>
              </div>
              <Badge
                variant={
                  !plan.pendingReview && plan.status === "ACTIVE"
                    ? "default"
                    : "secondary"
                }
              >
                {plan.pendingReview === "PENDING"
                  ? "Awaiting approval"
                  : plan.pendingReview
                    ? plan.proposedCreation
                      ? "Draft · not live"
                      : "Draft changes"
                    : plan.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {plan.pendingReview && (
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    {plan.proposedCreation
                      ? "This plan will appear in the app after approval."
                      : "Customers see the approved plan until these changes are approved."}
                  </p>
                  <Link
                    href={`/vendors/${vendorId}?tab=changes`}
                    className="text-primary underline"
                  >
                    {plan.pendingReview === "DRAFT"
                      ? "Open Changes to submit for approval"
                      : "View approval status"}
                  </Link>
                </div>
              )}
              <div className="flex gap-2">
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
              </div>
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
