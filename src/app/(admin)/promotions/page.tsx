import Link from "next/link";
import { requireSuperAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { PromotionManager } from "@/components/promotions/promotion-manager";
export default async function PromotionsPage() {
  await requireSuperAdmin();
  const [banners, listings] = await Promise.all([
    prisma.promotionalBanner.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.$queryRaw<
      { id: string; name: string }[]
    >`SELECT id,name FROM public.published_listings ORDER BY name`,
  ]);
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
