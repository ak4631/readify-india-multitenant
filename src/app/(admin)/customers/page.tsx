import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerTable } from "@/components/customers/customer-table";
import { listCustomers } from "@/server/actions/customers.actions";

export default async function CustomersPage() {
  const customers = await listCustomers();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Customers"
        title="Customers"
        description={`${customers.length} customers registered via the Readify India app.`}
      />
      <Card>
        <CardContent>
          <CustomerTable customers={customers} />
        </CardContent>
      </Card>
    </div>
  );
}
