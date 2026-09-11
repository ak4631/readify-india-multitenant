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
import { reviewVerificationDocument } from "@/server/actions/vendor-verification.actions";

export function ReviewPanel({ verificationId }: { verificationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  function approve() {
    startTransition(async () => {
      try {
        await reviewVerificationDocument({
          verificationId,
          decision: "VERIFIED",
        });
        toast.success("Document approved");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  function reject() {
    startTransition(async () => {
      try {
        await reviewVerificationDocument({
          verificationId,
          decision: "REJECTED",
          rejectionReason: reason,
        });
        toast.success("Document rejected");
        setRejectOpen(false);
        setReason("");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Action failed");
      }
    });
  }

  return (
    <>
      <Button
        size="sm"
        disabled={isPending}
        aria-busy={isPending}
        onClick={approve}
      >
        Approve
      </Button>
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
            <DialogTitle>Reject document</DialogTitle>
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
              onClick={reject}
            >
              Confirm Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
