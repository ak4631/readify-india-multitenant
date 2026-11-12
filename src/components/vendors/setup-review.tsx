"use client";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { submitVendorForReview as serverAction_submitVendorForReview } from "@/server/actions/vendors.actions";
import type { ReadinessIssue } from "@/lib/listing-readiness";
import { actionClient } from "@/lib/action-client";

const submitVendorForReview = actionClient(serverAction_submitVendorForReview);

export function SetupReview({
  vendorId,
  ready,
  issues,
  status,
}: {
  vendorId: string;
  ready: boolean;
  issues: ReadinessIssue[];
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Review and submit</h2>
      <p className="text-sm text-muted-foreground">
        Complete the required steps before submitting. Facilities and photos may
        be empty unless your service requires them. Bookings, customers and
        payments are created during operations, not onboarding.
      </p>
      {issues.length > 0 ? (
        <ul className="list-inside list-disc space-y-2 rounded-lg border p-4">
          {issues.map((i, n) => (
            <li key={n}>
              <Link
                href={`/vendors/${vendorId}?tab=${i.section}`}
                className="text-primary underline"
              >
                {i.message}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border p-4">
          Required listing details are complete. Super Admin will verify the
          uploaded documents before approval.
        </p>
      )}
      {status === "DRAFT" && (
        <Button
          disabled={!ready || pending}
          aria-busy={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await submitVendorForReview(vendorId);
                toast.success(
                  "Complete listing submitted for Super Admin approval",
                );
              } catch (e) {
                toast.error(
                  e instanceof Error ? e.message : "Could not submit listing",
                );
              }
            })
          }
        >
          {pending ? "Submitting…" : "Submit complete listing"}
        </Button>
      )}
      <p className="text-sm text-muted-foreground">
        Current state: {status.replaceAll("_", " ")}. Submission and account
        approval do not make this listing live; Super Admin must approve and
        publish it.
      </p>
    </div>
  );
}
