"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { actionClient } from "@/lib/action-client";
import { reopenListingRevisionForCorrection as serverAction_reopenListingRevisionForCorrection } from "@/server/actions/listing-changes.actions";

const reopenListingRevisionForCorrection = actionClient(
  serverAction_reopenListingRevisionForCorrection,
);

export function RevisionCorrectionNotice({
  revisionId,
}: {
  revisionId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <p>
        Need to fix operating hours or plans? Reopen for corrections to keep
        your proposed changes and unlock the editors. Submit the corrected draft
        for approval when ready.
      </p>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError("");
            try {
              await reopenListingRevisionForCorrection(revisionId);
              toast.success(
                "Editable draft created. Your proposed changes are preserved.",
              );
              router.refresh();
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Could not reopen this revision.",
              );
            }
          })
        }
      >
        {pending ? "Reopening…" : "Reopen revision for corrections"}
      </Button>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
