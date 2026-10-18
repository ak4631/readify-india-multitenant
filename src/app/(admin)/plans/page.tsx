import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { PlanList } from "@/components/vendors/plans/plan-list";
import { listVendors } from "@/server/actions/vendors.actions";
import { listMembershipPlans } from "@/server/actions/membership-plans.actions";

export default async function PlansPage() {
  const vendors = await listVendors();
  const groups = await Promise.all(
    vendors.map(async (vendor) => ({
      id: vendor.id,
      name: vendor.name,
      plans: await listMembershipPlans(vendor.id),
    })),
  );
  return (
    <div className="space-y-8">
      <PageHeader
        title="Plans & Subscriptions"
        description="Manage Flex rates and monthly, quarterly or yearly subscriptions. Material changes require Admin approval."
      />
      <Link href="/subscriptions" className="text-primary underline">
        View customer subscriptions
      </Link>
      {groups.map((group) => (
        <section key={group.id} className="space-y-4">
          <h2 className="text-xl font-semibold">{group.name}</h2>
          <PlanList vendorId={group.id} plans={group.plans} />
        </section>
      ))}
      {!groups.length && <p>Add a Library listing to configure plans.</p>}
    </div>
  );
}
