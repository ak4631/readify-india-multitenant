import { notFound } from "next/navigation";
import { requirePartnerAccess } from "@/lib/rbac";
import { PARTNER_MODULES } from "@/config/partner-modules";
import Vendors from "@/app/(admin)/vendors/page";
import Plans from "@/app/(admin)/plans/page";
import Subscriptions from "@/app/(admin)/subscriptions/page";
import Bookings from "@/app/(admin)/bookings/page";
import Customers from "@/app/(admin)/customers/page";
import Services from "@/app/(admin)/service-management/page";
import Payments from "@/app/(admin)/payments/page";
import Reviews from "@/app/(admin)/reviews/page";
import Team from "@/app/(admin)/team/page";
import Support from "@/app/(admin)/support/page";
import { ApprovalQueue } from "@/components/partners/approval-queue";
import { PartnerHistory } from "@/components/partners/partner-history";

type Search = Record<string, string | undefined>;
export default async function PartnerModule({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; module: string }>;
  searchParams: Promise<Search>;
}) {
  const { id, module } = await params;
  if (!PARTNER_MODULES.some((m) => m.key === module)) notFound();
  await requirePartnerAccess(id, "partner.read");
  // The route's organization always overrides an untrusted query-string tenant.
  const scoped = Promise.resolve({ ...(await searchParams), partnerId: id });
  switch (module) {
    case "vendors":
      return <Vendors searchParams={scoped} />;
    case "plans":
      return <Plans searchParams={scoped} />;
    case "subscriptions":
      return <Subscriptions searchParams={scoped} />;
    case "bookings":
      return <Bookings searchParams={scoped} />;
    case "customers":
      return <Customers searchParams={scoped} />;
    case "service-management":
      return <Services searchParams={scoped} />;
    case "payments":
      return <Payments searchParams={scoped} />;
    case "reviews":
      return <Reviews searchParams={scoped} />;
    case "team":
      return <Team searchParams={scoped} />;
    case "support":
      return <Support searchParams={scoped} />;
    case "approvals":
      return <ApprovalQueue partnerId={id} searchParams={await scoped} />;
    case "history":
      return <PartnerHistory partnerId={id} searchParams={await scoped} />;
    default:
      notFound();
  }
}
