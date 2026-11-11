"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePermission } from "@/hooks/use-permission";
import {
  discardDraftChange,
  reviewListingRevision,
  submitListingRevision,
  withdrawListingRevision,
  reviseListingRevision,
  type listListingRevisions,
} from "@/server/actions/listing-changes.actions";

type Revision = Awaited<ReturnType<typeof listListingRevisions>>[number];
const title = (s: string) =>
  s.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2");
function Value({
  value,
  labels,
}: {
  value: unknown;
  labels: Record<string, string>;
}) {
  if (value === null || value === undefined || value === "")
    return <span>Not set</span>;
  if (Array.isArray(value))
    return value.length ? (
      <ul className="list-inside list-disc">
        {value.map((v, i) => (
          <li key={i}>
            <Value value={v} labels={labels} />
          </li>
        ))}
      </ul>
    ) : (
      <span>None selected</span>
    );
  if (typeof value === "object")
    return (
      <dl className="space-y-2">
        {Object.entries(value).map(([key, v]) => (
          <div key={key}>
            <dt className="font-medium capitalize">{title(key)}</dt>
            <dd>
              <Value value={v} labels={labels} />
            </dd>
          </div>
        ))}
      </dl>
    );
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  return (
    <span className="break-words">
      {labels[String(value)] ?? String(value)}
    </span>
  );
}
export function ListingChangeList({
  revisions,
  labels = {},
}: {
  revisions: Revision[];
  labels?: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Save proposed edits in the listing tabs, then submit the whole revision
        here. Customers continue to see the approved version until Super Admin
        approves. You can withdraw an undecided revision or copy a rejected
        revision for correction.
      </p>
      {!revisions.length && <p>No proposed changes.</p>}
      {revisions.map((r) => (
        <RevisionCard key={r.id} revision={r} labels={labels} />
      ))}
    </div>
  );
}
function RevisionCard({
  revision: r,
  labels,
}: {
  revision: Revision;
  labels: Record<string, string>;
}) {
  const canEdit = usePermission("vendor.update");
  const canApprove = usePermission("vendor.approve");
  const canReject = usePermission("vendor.reject");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<void>, message: string) {
    startTransition(async () => {
      try {
        await action();
        toast.success(message);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not complete this action",
        );
      }
    });
  }
  return (
    <section
      className="space-y-4 rounded-lg border bg-card p-5"
      aria-busy={pending}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          Listing revision · {r.changes.length} changes
        </h3>
        <span className="rounded border px-2 py-1 text-xs">{r.status}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Based on approved version {r.baseVersion} ·{" "}
        {new Date(r.createdAt).toLocaleString("en-IN")}
      </p>
      {r.reason && (
        <p className="rounded border p-3">Review feedback: {r.reason}</p>
      )}
      {r.changes.map((c) => (
        <details key={c.id} className="rounded border p-3">
          <summary className="cursor-pointer font-medium capitalize">
            {title(c.kind)}
            {labels[c.targetId] ? ` · ${labels[c.targetId]}` : ""}
          </summary>
          <div className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="mb-2 font-semibold">Approved</p>
              <Value value={c.approved} labels={labels} />
            </div>
            <div>
              <p className="mb-2 font-semibold">Proposed</p>
              <Value
                value={
                  c.kind === "DOCUMENT_CREATE" &&
                  c.payload &&
                  typeof c.payload === "object"
                    ? {
                        ...c.payload,
                        documentUrl: "Private verification document uploaded",
                      }
                    : c.payload
                }
                labels={labels}
              />
            </div>
          </div>
          {r.status === "DRAFT" && canEdit && (
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(
                  () => discardDraftChange(c.id),
                  "Draft change and its dependent proposed items removed",
                )
              }
            >
              Remove proposed change
            </Button>
          )}
        </details>
      ))}
      <div className="flex flex-wrap gap-3">
        {r.status === "DRAFT" && canEdit && (
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () => submitListingRevision(r.id),
                "Revision submitted for Super Admin approval",
              )
            }
          >
            Submit revision
          </Button>
        )}
        {["DRAFT", "PENDING"].includes(r.status) && canEdit && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => withdrawListingRevision(r.id),
                "Revision withdrawn; approved content is unchanged",
              )
            }
          >
            Withdraw revision
          </Button>
        )}
        {["REJECTED", "WITHDRAWN"].includes(r.status) && canEdit && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => reviseListingRevision(r.id),
                "Draft revision created for correction",
              )
            }
          >
            Copy for correction
          </Button>
        )}
        {r.status === "PENDING" && canApprove && (
          <Button
            disabled={pending}
            onClick={() =>
              run(
                () => reviewListingRevision(r.id, r.digest, true),
                "All revision changes approved",
              )
            }
          >
            Approve revision
          </Button>
        )}
      </div>
      {r.status === "PENDING" && canReject && (
        <div className="space-y-3">
          <Textarea
            aria-label="Revision rejection reason"
            placeholder="Explain what needs correction"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            variant="destructive"
            disabled={pending || reason.trim().length < 3}
            onClick={() =>
              run(
                () => reviewListingRevision(r.id, r.digest, false, reason),
                "Revision rejected; approved content is unchanged",
              )
            }
          >
            Reject revision
          </Button>
        </div>
      )}
    </section>
  );
}
