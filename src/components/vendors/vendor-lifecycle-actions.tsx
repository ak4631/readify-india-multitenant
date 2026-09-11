"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { VendorStatus } from "@/generated/prisma/enums";
import { usePermission } from "@/hooks/use-permission";
import {
  approveVendor,
  publishVendor,
  rejectVendor,
  suspendVendor,
} from "@/server/actions/vendors.actions";

export function VendorLifecycleActions({
  vendorId,
  status,
}: {
  vendorId: string;
  status: VendorStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const canApprove = usePermission("vendor.approve");
  const canReject = usePermission("vendor.reject");
  const canPublish = usePermission("vendor.publish");
  const canSuspend = usePermission("vendor.suspend");

  function run(action: () => Promise<void>, successMessage: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(successMessage);
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <div className="flex gap-2">
      {status === "UNDER_REVIEW" && canApprove && (
        <Button
          size="sm"
          disabled={isPending}
          aria-busy={isPending}
          onClick={() => run(() => approveVendor(vendorId), "Listing approved")}
        >
          Approve
        </Button>
      )}
      {status === "UNDER_REVIEW" && canReject && (
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogTrigger
            render={
              <Button
                size="sm"
                variant="destructive"
                disabled={isPending}
                aria-busy={isPending}
              >
                Reject
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject partner listing</DialogTitle>
            </DialogHeader>
            <Textarea
              placeholder="Rejection reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={isPending || !reason}
                aria-busy={isPending}
                onClick={() =>
                  run(async () => {
                    await rejectVendor(vendorId, reason);
                    setRejectOpen(false);
                    setReason("");
                  }, "Listing rejected")
                }
              >
                Confirm Reject
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {status === "APPROVED" && canPublish && (
        <Button
          size="sm"
          disabled={isPending}
          aria-busy={isPending}
          onClick={() =>
            run(() => publishVendor(vendorId), "Listing published")
          }
        >
          Publish
        </Button>
      )}
      {status === "PUBLISHED" && canSuspend && (
        <Button
          size="sm"
          variant="destructive"
          disabled={isPending}
          aria-busy={isPending}
          onClick={() =>
            run(() => suspendVendor(vendorId), "Listing suspended")
          }
        >
          Suspend
        </Button>
      )}
    </div>
  );
}
