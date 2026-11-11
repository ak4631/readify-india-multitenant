import { partnerPath } from "@/lib/partner-path";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SubscriptionTable } from "@/components/subscriptions/subscription-table";
import { ListPagination } from "@/components/layout/list-pagination";
import { parsePage } from "@/lib/pagination";
import { listSubscriptions } from "@/server/actions/subscriptions.actions";

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ partnerId?: string; page?: string }>;
}) {
  const params = await searchParams;
  const subscriptions = await listSubscriptions({
    partnerId: params.partnerId,
    page: parsePage(params.page),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Subscriptions"
        title="Customer subscriptions"
        description={`${subscriptions.total} plan purchases across all partner listings.`}
      />
      <Card>
        <CardContent>
          <SubscriptionTable
            subscriptions={subscriptions.items}
            showVendor
            showCustomer
          />
          <ListPagination
            page={subscriptions}
            path={partnerPath(params.partnerId, "subscriptions")}
            params={params}
            noun="subscriptions"
          />
        </CardContent>
      </Card>
    </div>
  );
}
