import { BrandLogo } from "@/components/layout/brand-logo";
import { prisma } from "@/lib/prisma";
import { RegistrationForm } from "./registration-form";
export const dynamic = "force-dynamic";
export default async function RegistrationPage() {
  const services = await prisma.vendorCategory.findMany({
    where: { status: "ACTIVE" },
    select: { slug: true, name: true },
    orderBy: { sortOrder: "asc" },
  });
  return (
    <main className="mx-auto max-w-lg space-y-6 px-6 py-12">
      <BrandLogo className="w-44" />
      <h1 className="text-3xl font-semibold">Partner with ZEROTHAM</h1>
      <p>
        Choose the service your organization offers. Admin approval is required
        before you can sign in and onboard listings.
      </p>
      <RegistrationForm
        services={services.map((service) => ({
          id: service.slug,
          name: service.name,
        }))}
      />
    </main>
  );
}
