import type { DocumentType } from "@/generated/prisma/enums";

// categorySlug -> required document types for that vendor category, per PLAN.md §8.
export const VERIFICATION_REQUIREMENTS: Record<string, DocumentType[]> = {
  library: ["BUSINESS_REGISTRATION", "ADDRESS_PROOF", "OWNER_ID"],
  gym: ["BUSINESS_REGISTRATION", "ADDRESS_PROOF", "OWNER_ID", "TRAINER_CERTIFICATION"],
  "study-cafe": ["BUSINESS_REGISTRATION", "ADDRESS_PROOF", "OWNER_ID"],
  "exam-hub": ["BUSINESS_REGISTRATION", "ADDRESS_PROOF", "OWNER_ID", "EDUCATIONAL_DOCUMENT"],
};

export function getRequiredDocuments(categorySlug: string): DocumentType[] {
  return VERIFICATION_REQUIREMENTS[categorySlug] ?? ["BUSINESS_REGISTRATION", "ADDRESS_PROOF", "OWNER_ID"];
}
