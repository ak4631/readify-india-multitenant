import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { StepAddress } from "@/components/vendors/wizard/step-address";
import { StepBasicInfo } from "@/components/vendors/wizard/step-basic-info";
import { StepVerification } from "@/components/vendors/wizard/step-verification";
import { WizardProgress } from "@/components/vendors/wizard/wizard-progress";
import { getRequiredDocuments } from "@/config/verification-requirements";
import { listVendorCategories } from "@/server/actions/vendor-categories.actions";
import { getVendorById } from "@/server/actions/vendors.actions";
import { isSuperAdmin, requirePermissionOrRedirect } from "@/lib/rbac";

export default async function NewVendorPage({
  searchParams,
}: {
  searchParams: Promise<{
    step?: string;
    vendorId?: string;
    partnerId?: string;
  }>;
}) {
  const session = await requirePermissionOrRedirect("vendor.create");
  const { step: stepParam, vendorId, partnerId } = await searchParams;
  if (isSuperAdmin(session) && !partnerId && !vendorId) redirect("/partners");
  const step = Number(stepParam ?? "1");

  const categories = await listVendorCategories();

  let stepContent: React.ReactNode;

  if (step === 1 || !vendorId) {
    stepContent = (
      <StepBasicInfo categories={categories} partnerId={partnerId} />
    );
  } else {
    const vendor = await getVendorById(vendorId);
    if (!vendor) notFound();

    if (step === 2) {
      stepContent = <StepAddress vendorId={vendor.id} />;
    } else {
      stepContent = (
        <StepVerification
          vendorId={vendor.id}
          requiredDocuments={getRequiredDocuments(vendor.category.slug)}
          verifications={vendor.verifications}
        />
      );
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        eyebrow="Partner onboarding"
        title="Add a listing"
        description="Add a Library, Gym, Study Cafe, or Exam Hub listing to the partner workspace."
      />
      <WizardProgress currentStep={Math.min(step, 3)} />
      {stepContent}
    </div>
  );
}
