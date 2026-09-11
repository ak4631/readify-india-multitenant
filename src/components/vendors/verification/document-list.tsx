"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VerificationStatusBadge } from "@/components/vendors/vendor-status-badge";
import { ReviewPanel } from "@/components/vendors/verification/review-panel";
import type { VendorVerification } from "@/generated/prisma/client";
import { usePermission } from "@/hooks/use-permission";
import { getVerificationDocumentUrl } from "@/server/actions/vendor-verification.actions";

export function DocumentList({
  verifications,
}: {
  verifications: VendorVerification[];
}) {
  const [isPending, startTransition] = useTransition();
  const canReview = usePermission("verification.review");

  function handleView(verificationId: string) {
    startTransition(async () => {
      try {
        const signedUrl = await getVerificationDocumentUrl(verificationId);
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not open document",
        );
      }
    });
  }

  if (verifications.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No documents uploaded yet.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Document</TableHead>
          <TableHead>Number</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {verifications.map((doc) => (
          <TableRow key={doc.id}>
            <TableCell>{doc.documentType.replace(/_/g, " ")}</TableCell>
            <TableCell>{doc.documentNumber ?? "—"}</TableCell>
            <TableCell>
              <VerificationStatusBadge status={doc.status} />
              {doc.status === "REJECTED" && doc.rejectionReason && (
                <p className="text-muted-foreground mt-1 text-xs">
                  {doc.rejectionReason}
                </p>
              )}
            </TableCell>
            <TableCell className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isPending}
                aria-busy={isPending}
                onClick={() => handleView(doc.id)}
              >
                View
              </Button>
              {canReview && doc.status === "PENDING" && (
                <ReviewPanel verificationId={doc.id} />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
