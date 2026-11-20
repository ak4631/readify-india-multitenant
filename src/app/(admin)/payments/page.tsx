import Link from "next/link";
import { PendingPayments } from "@/components/subscriptions/pending-payments";
import { listPendingPayments } from "@/server/actions/pending-payments.actions";
import { partnerPath } from "@/lib/partner-path";
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
  searchParams: Promise<{ partnerId?: string; page?: string; status?: string }>;
}) {
  const params = await searchParams;
  const pending = params.status === "pending";
  const queue = pending
    ? await listPendingPayments({
        partnerId: params.partnerId,
        page: parsePage(params.page),
      })
    : null;
  const ledger = pending
    ? null
    : await listPaymentLedger(parsePage(params.page), params.partnerId);
  const rows = ledger?.items ?? [];
  return (
    <div className="space-y-6">
      <LiveRefresh />
      <PageHeader
        title="Payments & Revenue"
        description="Checkout transactions, newest first. Refund pending and refunded are separate states. Commission and payouts are awaiting business configuration."
      />
      <nav aria-label="Payment filters" className="flex gap-4">
        <Link
          href={partnerPath(params.partnerId, "payments")}
          aria-current={!pending ? "page" : undefined}
          className="text-primary underline"
        >
          All transactions
        </Link>
        <Link
          href={`${partnerPath(params.partnerId, "payments")}?status=pending`}
          aria-current={pending ? "page" : undefined}
          className="text-primary underline"
        >
          Payment Pending
        </Link>
      </nav>
      {queue ? (
        <>
          <PendingPayments data={queue} />
          <ListPagination
            page={queue}
            path={partnerPath(params.partnerId, "payments")}
            params={params}
            noun="pending payments"
          />
        </>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "Listing",
                  "Type",
                  "Amount",
                  "Status",
                  "Refund reference",
                ].map((title) => (
                  <TableHead key={title}>{title}</TableHead>
                ))}
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
            page={ledger!}
            path={partnerPath(params.partnerId, "payments")}
            params={params}
            noun="transactions"
          />
        </>
      )}
    </div>
  );
}
