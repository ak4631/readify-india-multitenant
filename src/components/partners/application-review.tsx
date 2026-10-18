"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { reviewPartnerApplication } from "@/server/actions/partners.actions";

export function ApplicationReview({ partnerId }: { partnerId: string }) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function decide(approve: boolean) {
    startTransition(async () => {
      try {
        await reviewPartnerApplication(partnerId, approve, reason);
        toast.success("Application reviewed");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Review failed");
      }
    });
  }
  return (
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="font-semibold">Partner application awaiting review</h2>
      <p>
        Approval activates the organization account. Individual listings and
        documents still require their own approval before publication.
      </p>
      <Textarea
        aria-label="Application rejection reason"
        placeholder="Reason if rejecting"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="flex gap-3">
        <Button disabled={pending} onClick={() => decide(true)}>
          Approve organization
        </Button>
        <Button
          variant="destructive"
          disabled={pending || reason.trim().length < 3}
          onClick={() => decide(false)}
        >
          Reject application
        </Button>
      </div>
    </section>
  );
}
