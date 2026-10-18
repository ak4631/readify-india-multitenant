import { prisma } from "@/lib/prisma";
import { RegistrationForm } from "./registration-form";
export const dynamic = "force-dynamic";
export default async function RegistrationPage() {
  const services = await prisma.vendorCategory.findMany({
    select: { slug: true, name: true, launchEnabled: true, status: true },
    orderBy: { sortOrder: "asc" },
  });
  return (
    <main className="mx-auto max-w-lg space-y-6 px-6 py-12">
      <h1 className="text-3xl font-semibold">Partner with Vriddhora</h1>
      <p>
        Library applications are open for Delhi. Your organization can add
        further services as they launch. Admin approval is required before you
        can sign in and onboard listings.
      </p>
      <RegistrationForm
        services={services.map((service) => ({
          id: service.slug,
          name: service.name,
          enabled: service.launchEnabled && service.status === "ACTIVE",
        }))}
      />
    </main>
  );
}
