import { z } from "zod";
import { PageHeader } from "@/components/layout/page-header";
import { ListPagination } from "@/components/layout/list-pagination";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerTable } from "@/components/customers/customer-table";
import { parsePage } from "@/lib/pagination";
import { listCustomers } from "@/server/actions/customers.actions";
import { LiveRefresh } from "@/components/layout/live-refresh";

const CUSTOMER_TYPES = ["all", "new", "active", "permanent", "flexible"] as const;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const params = await searchParams;
  const type = z.enum(CUSTOMER_TYPES).catch("all").parse(params.type ?? "all");
  const { scope, customers } = await listCustomers({
    page: parsePage(params.page),
    type,
  });

  return (
    <div className="space-y-8">
      <LiveRefresh />
      <PageHeader
        eyebrow="Customers"
        title="Customers"
        description={
          scope === "partner"
            ? `${customers.total} customer${customers.total === 1 ? "" : "s"} who have booked or subscribed across your listings.`
            : `${customers.total} customers registered via the Vriddhora app.`
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
                {CUSTOMER_TYPES.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
              <button className="rounded border px-4">Filter</button>
            </form>
          )}
          <CustomerTable customers={customers.items} scope={scope} />
          <ListPagination
            page={customers}
            path="/customers"
            params={params}
            noun="customers"
          />
        </CardContent>
      </Card>
    </div>
  );
}
