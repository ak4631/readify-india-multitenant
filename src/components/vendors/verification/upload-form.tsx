"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DocumentType } from "@/generated/prisma/enums";
import { uploadVerificationDocument } from "@/server/actions/vendor-verification.actions";

const LABELS: Record<DocumentType, string> = {
  BUSINESS_REGISTRATION: "Business Registration",
  GST_CERTIFICATE: "GST Certificate",
  PAN: "PAN",
  OWNER_ID: "Owner ID",
  ADDRESS_PROOF: "Address Proof",
  TRAINER_CERTIFICATION: "Trainer Certification",
  EDUCATIONAL_DOCUMENT: "Educational/Business Document",
  OTHER: "Other",
};

export function UploadForm({
  vendorId,
  requiredDocuments,
}: {
  vendorId: string;
  requiredDocuments: DocumentType[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>(
    requiredDocuments[0],
  );

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError("");
    try {
      const result = await uploadVerificationDocument(formData);
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      toast.success("Document uploaded. Awaiting Super Admin verification.");
      formRef.current?.reset();
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      ref={formRef}
      action={handleSubmit}
      className="flex flex-wrap items-end gap-3"
    >
      <input type="hidden" name="vendorId" value={vendorId} />
      <div className="space-y-1">
        <Label htmlFor={`document-type-${vendorId}`}>Document Type</Label>
        <Select
          name="documentType"
          value={documentType}
          onValueChange={(value) => value && setDocumentType(value)}
        >
          <SelectTrigger id={`document-type-${vendorId}`} className="w-56">
            <SelectValue>{LABELS[documentType]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {requiredDocuments.map((type) => (
              <SelectItem key={type} value={type}>
                {LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`document-number-${vendorId}`}>Document Number</Label>
        <Input
          id={`document-number-${vendorId}`}
          name="documentNumber"
          className="w-48"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`document-file-${vendorId}`}>File</Label>
        <Input
          id={`document-file-${vendorId}`}
          type="file"
          name="file"
          accept=".pdf,.jpg,.jpeg,.png"
          required
        />
      </div>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
        {isSubmitting ? "Uploading..." : "Upload"}
      </Button>
    </form>
  );
}
