import Link from "next/link";
import { requireSuperAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/layout/page-header";
import { CampaignManager } from "@/components/promotions/campaign-manager";
export default async function MarketingPage() {
  await requireSuperAdmin();
  const [campaigns, listings, services] = await Promise.all([
    prisma.marketingCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.$queryRaw<
      { id: string; name: string }[]
    >`SELECT id,name FROM public.published_listings ORDER BY name`,
    prisma.vendorCategory.findMany({
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing"
        description="Create promotional notifications, choose your audience and schedule delivery."
      />
      <nav aria-label="Marketing sections" className="flex gap-4 border-b pb-3">
        <Link
          href="/marketing"
          aria-current="page"
          className="font-semibold text-primary"
        >
          Promotional notifications
        </Link>
        <Link href="/promotions">Home banners</Link>
      </nav>
      <CampaignManager
        campaigns={campaigns.map((c) => ({
          ...c,
          scheduledAt: c.scheduledAt.toISOString(),
          queuedAt: c.queuedAt?.toISOString() ?? null,
          createdAt: c.createdAt.toISOString(),
        }))}
        listings={listings}
        services={services.map((s) => ({
          id: s.slug.replaceAll("-", "_"),
          name: s.name,
        }))}
      />
    </div>
  );
}
