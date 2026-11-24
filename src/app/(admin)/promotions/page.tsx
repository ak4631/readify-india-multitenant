import Link from "next/link";
import { requireSuperAdmin } from "@/lib/rbac";
import { getPromotionsPageData } from "@/server/actions/page-data.actions";
import { PageHeader } from "@/components/layout/page-header";
import { PromotionManager } from "@/components/promotions/promotion-manager";
export default async function PromotionsPage() {
  await requireSuperAdmin();
  const [banners, listings] = await getPromotionsPageData();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Promotional Banners"
        description="Schedule up to four visible home promotions per customer location. Dates use your browser's local time."
      />
      <Link href="/marketing" className="text-primary underline">
        Marketing / Promotional notifications
      </Link>
      <PromotionManager
        banners={banners.map((b) => ({
          ...b,
          startsAt: b.startsAt.toISOString(),
          endsAt: b.endsAt.toISOString(),
          createdAt: b.createdAt.toISOString(),
          updatedAt: b.updatedAt.toISOString(),
        }))}
        listings={listings}
      />
    </div>
  );
}
