"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/use-permission";
import {
  reviewListingChange,
  type listListingChanges,
} from "@/server/actions/listing-changes.actions";

export function ListingChangeList({
  changes,
}: {
  changes: Awaited<ReturnType<typeof listListingChanges>>;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Changes to an approved listing require Admin review. Customers continue
        to see the approved version until a change is approved.
      </p>
      {changes.length === 0 && <p>No proposed changes.</p>}
      {changes.map((change) => (
        <ChangeCard key={change.id} change={change} />
      ))}
    </div>
  );
}

function ChangeCard({
  change,
}: {
  change: Awaited<ReturnType<typeof listListingChanges>>[number];
}) {
  const router = useRouter();
  const canApprove = usePermission("vendor.approve");
  const canReject = usePermission("vendor.reject");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  function review(approve: boolean) {
    startTransition(async () => {
      try {
        await reviewListingChange(change.id, approve, reason);
        toast.success(approve ? "Change approved" : "Change rejected");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Review failed");
      }
    });
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between gap-4">
          {change.kind.toLowerCase().replaceAll("_", " ")}
          <Badge>{change.status}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {Object.entries(
            typeof change.payload === "object" &&
              change.payload !== null &&
              !Array.isArray(change.payload)
              ? change.payload
              : { values: change.payload },
          ).map(([key, value]) => (
            <div key={key}>
              <dt className="font-medium">{key}</dt>
              <dd className="break-words text-muted-foreground">
                {typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value ?? "Not set")}
              </dd>
            </div>
          ))}
        </dl>
        {change.reason && <p>{change.reason}</p>}
        {change.status === "PENDING" && (canApprove || canReject) && (
          <div className="space-y-3">
            {canReject && (
              <Textarea
                aria-label="Rejection reason"
                placeholder="Reason if rejecting this change"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
            <div className="flex gap-2">
              {canApprove && (
                <Button disabled={pending} onClick={() => review(true)}>
                  Approve change
                </Button>
              )}
              {canReject && (
                <Button
                  variant="destructive"
                  disabled={pending || reason.trim().length < 3}
                  onClick={() => review(false)}
                >
                  Reject change
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
