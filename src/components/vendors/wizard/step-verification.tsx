"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DocumentList } from "@/components/vendors/verification/document-list";
import { UploadForm } from "@/components/vendors/verification/upload-form";
import type { DocumentType } from "@/generated/prisma/enums";
import type { VendorVerification } from "@/generated/prisma/client";
import { submitVendorForReview } from "@/server/actions/vendors.actions";

export function StepVerification({
  vendorId,
  requiredDocuments,
  verifications,
}: {
  vendorId: string;
  requiredDocuments: DocumentType[];
  verifications: VendorVerification[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmitForReview() {
    startTransition(async () => {
      try {
        await submitVendorForReview(vendorId);
        toast.success("Partner listing submitted for review");
        router.push(`/vendors/${vendorId}`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Submission failed",
        );
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold">Verification</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload the documents required for this category, then submit the
            listing for review.
          </p>
        </div>
        <div className="space-y-6">
          <UploadForm
            vendorId={vendorId}
            requiredDocuments={requiredDocuments}
          />
          <DocumentList verifications={verifications} />
          <Button
            onClick={handleSubmitForReview}
            disabled={isPending || verifications.length === 0}
            aria-busy={isPending}
          >
            {isPending ? "Submitting..." : "Submit for Review"}
          </Button>
        </div>
      </section>
    </div>
  );
}
