"use client";

import Link from "next/link";
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
  approveVendor as serverAction_approveVendor,
  reopenLegacyListing as serverAction_reopenLegacyListing,
  publishVendor as serverAction_publishVendor,
  rejectVendor as serverAction_rejectVendor,
  suspendVendor as serverAction_suspendVendor,
  reviseRejectedVendor as serverAction_reviseRejectedVendor,
  requestListingReactivation as serverAction_requestListingReactivation,
} from "@/server/actions/vendors.actions";
import { actionClient } from "@/lib/action-client";

const approveVendor = actionClient(serverAction_approveVendor);
const reopenLegacyListing = actionClient(serverAction_reopenLegacyListing);
const publishVendor = actionClient(serverAction_publishVendor);
const rejectVendor = actionClient(serverAction_rejectVendor);
const suspendVendor = actionClient(serverAction_suspendVendor);
const reviseRejectedVendor = actionClient(serverAction_reviseRejectedVendor);
const requestListingReactivation = actionClient(
  serverAction_requestListingReactivation,
);

export function VendorLifecycleActions({
  vendorId,
  status,
  submissionVersion,
}: {
  vendorId: string;
  status: VendorStatus;
  submissionVersion: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const canApprove = usePermission("vendor.approve");
  const canReject = usePermission("vendor.reject");
  const canPublish = usePermission("vendor.publish");
  const canSuspend = usePermission("vendor.suspend");
  const canEdit = usePermission("vendor.update");

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
    <div className="flex flex-wrap gap-2">
      {["SUBMITTED", "UNDER_REVIEW"].includes(status) &&
        submissionVersion === 0 &&
        canReject && (
          <Button
            size="sm"
            disabled={isPending}
            onClick={() =>
              run(
                () => reopenLegacyListing(vendorId),
                "Returned to draft for complete setup",
              )
            }
          >
            Return legacy review to draft
          </Button>
        )}
      {status === "DRAFT" && canEdit && (
        <Link
          className="rounded border px-3 py-2 text-sm"
          href={`/vendors/${vendorId}?tab=review`}
        >
          Review setup
        </Link>
      )}
      {status === "REJECTED" && canEdit && (
        <Button
          size="sm"
          disabled={isPending}
          onClick={() =>
            run(
              () => reviseRejectedVendor(vendorId),
              "Draft reopened for corrections",
            )
          }
        >
          Revise listing
        </Button>
      )}
      {status === "SUSPENDED" && canEdit && (
        <Button
          size="sm"
          disabled={isPending}
          onClick={() =>
            run(
              () => requestListingReactivation(vendorId),
              "Reactivation requested",
            )
          }
        >
          Request reactivation
        </Button>
      )}
      {status === "UNDER_REVIEW" && canApprove && (
        <Button
          size="sm"
          disabled={isPending}
          aria-busy={isPending}
          onClick={() =>
            run(
              () => approveVendor(vendorId, submissionVersion),
              "Listing approved",
            )
          }
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
                    await rejectVendor(vendorId, reason, submissionVersion);
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
            run(
              () => publishVendor(vendorId, submissionVersion),
              "Listing published",
            )
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
