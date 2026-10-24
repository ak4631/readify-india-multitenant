import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ListPagination } from "@/components/layout/list-pagination";
import { parsePage } from "@/lib/pagination";
import { PlanList } from "@/components/vendors/plans/plan-list";
import { listVendorsPage } from "@/server/actions/vendors.actions";
import { listMembershipPlans } from "@/server/actions/membership-plans.actions";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const vendors = await listVendorsPage({
    page: parsePage(params.page),
    pageSize: 10,
  });
  const groups = await Promise.all(
    vendors.items.map(async (vendor) => ({
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
      {!vendors.total && <p>Add a Library listing to configure plans.</p>}
      <ListPagination
        page={vendors}
        path="/plans"
        params={params}
        noun="listings"
      />
    </div>
  );
}
