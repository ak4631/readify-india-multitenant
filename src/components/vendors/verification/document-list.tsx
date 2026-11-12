"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DocumentType } from "@/generated/prisma/enums";
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
import { getVerificationDocumentUrl as serverAction_getVerificationDocumentUrl } from "@/server/actions/vendor-verification.actions";
import { actionClient } from "@/lib/action-client";

const getVerificationDocumentUrl = actionClient(
  serverAction_getVerificationDocumentUrl,
);

export function DocumentList({
  verifications,
  requiredDocuments,
}: {
  verifications: VendorVerification[];
  requiredDocuments: DocumentType[];
}) {
  const [isPending, startTransition] = useTransition();
  const canReview = usePermission("verification.review");
  const missing = requiredDocuments.filter(
    (type) => !verifications.some((doc) => doc.documentType === type),
  );
  const verifiedCount = requiredDocuments.filter((type) =>
    verifications.some(
      (doc) => doc.documentType === type && doc.status === "VERIFIED",
    ),
  ).length;

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

  if (verifications.length === 0 && requiredDocuments.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No documents uploaded yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p role="status" className="text-sm text-muted-foreground">
        {verifiedCount} of {requiredDocuments.length} required document types
        verified.
        {missing.length > 0 &&
          " Upload the missing required documents shown below."}
      </p>
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
          {missing.map((type) => (
            <TableRow key={type}>
              <TableCell>{type.replaceAll("_", " ")}</TableCell>
              <TableCell>—</TableCell>
              <TableCell>
                <Badge variant="destructive">Not uploaded</Badge>
              </TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">
                Required document
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
