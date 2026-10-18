import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerTable } from "@/components/customers/customer-table";
import { listCustomers } from "@/server/actions/customers.actions";
import { LiveRefresh } from "@/components/layout/live-refresh";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { scope, customers, asOf } = await listCustomers();
  const { type = "all" } = await searchParams;
  const filtered = customers.filter(
    (customer) =>
      type === "all" ||
      (type === "permanent"
        ? !!customer.activeSubscriptions
        : type === "flexible"
          ? !!customer.flexibleBookings
          : type === "active"
            ? !!customer.present
            : type === "new"
              ? customer.joinedAt.getTime() > asOf.getTime() - 7 * 86400000
              : true),
  );

  return (
    <div className="space-y-8">
      <LiveRefresh />
      <PageHeader
        eyebrow="Customers"
        title="Customers"
        description={
          scope === "partner"
            ? `${customers.length} customer${customers.length === 1 ? "" : "s"} who have booked or subscribed across your listings.`
            : `${customers.length} customers registered via the Vriddhora app.`
        }
      />
      <Card>
        <CardContent>
          {scope === "partner" && (
            <form className="mb-4 flex gap-3">
              <select
                aria-label="Customer type"
                name="type"
                defaultValue={type}
                className="rounded border p-2"
              >
                {["all", "new", "active", "permanent", "flexible"].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
              <button className="rounded border px-4">Filter</button>
            </form>
          )}
          <CustomerTable customers={filtered} scope={scope} />
        </CardContent>
      </Card>
    </div>
  );
}
