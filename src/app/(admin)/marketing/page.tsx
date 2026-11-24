import Link from "next/link";
import { previewMarketingAudience } from "@/server/actions/marketing.actions";
import { requireSuperAdmin } from "@/lib/rbac";
import { getMarketingPageData } from "@/server/actions/page-data.actions";
import { PageHeader } from "@/components/layout/page-header";
import { CampaignManager } from "@/components/promotions/campaign-manager";
export default async function MarketingPage() {
  await requireSuperAdmin();
  const [[campaigns, listings, services], audience] = await Promise.all([
    getMarketingPageData(),
    previewMarketingAudience(new FormData()),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing"
        description="Send one-time notifications to all active users or a filtered audience. Send now or choose a future delivery time."
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
        initialAudience={audience}
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
