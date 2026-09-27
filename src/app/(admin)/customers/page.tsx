import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerTable } from "@/components/customers/customer-table";
import { listCustomers } from "@/server/actions/customers.actions";

export default async function CustomersPage() {
  const { scope, customers } = await listCustomers();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Customers"
        title="Customers"
        description={
          scope === "partner"
            ? `${customers.length} customer${customers.length === 1 ? "" : "s"} who have booked or subscribed across your listings.`
            : `${customers.length} customers registered via the Readify India app.`
        }
      />
      <Card>
        <CardContent>
          <CustomerTable customers={customers} scope={scope} />
        </CardContent>
      </Card>
    </div>
  );
}
