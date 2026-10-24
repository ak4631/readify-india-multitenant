import { PageHeader } from "@/components/layout/page-header";
import { LiveRefresh } from "@/components/layout/live-refresh";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListPagination } from "@/components/layout/list-pagination";
import { parsePage } from "@/lib/pagination";
import { listPaymentLedger } from "@/server/actions/workspace.actions";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const ledger = await listPaymentLedger(parsePage(params.page));
  const rows = ledger.items;
  return (
    <div className="space-y-6">
      <LiveRefresh />
      <PageHeader
        title="Payments & Revenue"
        description="Checkout transactions, newest first. Refund pending and refunded are separate states. Commission and payouts are awaiting business configuration."
      />
      <Table>
        <TableHeader>
          <TableRow>
            {["Listing", "Type", "Amount", "Status", "Refund reference"].map(
              (title) => (
                <TableHead key={title}>{title}</TableHead>
              ),
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.vendorName}</TableCell>
              <TableCell>{row.kind}</TableCell>
              <TableCell>₹{(row.amountPaise / 100).toFixed(2)}</TableCell>
              <TableCell>{row.status}</TableCell>
              <TableCell>{row.refundId ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!rows.length && <p>No checkout transactions yet.</p>}
      <ListPagination
        page={ledger}
        path="/payments"
        params={params}
        noun="transactions"
      />
    </div>
  );
}
