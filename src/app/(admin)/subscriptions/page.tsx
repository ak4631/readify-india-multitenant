import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SubscriptionTable } from "@/components/subscriptions/subscription-table";
import { listSubscriptions } from "@/server/actions/subscriptions.actions";

export default async function SubscriptionsPage() {
  const subscriptions = await listSubscriptions();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Subscriptions"
        title="Customer subscriptions"
        description={`${subscriptions.length} plan purchases across all partner listings.`}
      />
      <Card>
        <CardContent>
          <SubscriptionTable subscriptions={subscriptions} showVendor showCustomer />
        </CardContent>
      </Card>
    </div>
  );
}
