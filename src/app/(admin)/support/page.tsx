import { PageHeader } from "@/components/layout/page-header";
import { ListPagination } from "@/components/layout/list-pagination";
import { parsePage } from "@/lib/pagination";
import { TicketList } from "@/components/support/ticket-list";
import { listSupportTickets } from "@/server/actions/support.actions";
import { getCurrentSession, isPlatformStaff } from "@/lib/rbac";

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const tickets = await listSupportTickets(parsePage(params.page));
  const session = await getCurrentSession();
  const canRespond =
    !!session &&
    isPlatformStaff(session) &&
    session.user.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(role),
    );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Help & Support"
        description="Get help with bookings, approval and payments."
      />
      <details className="rounded-xl border p-5">
        <summary className="font-semibold">
          Why is my listing change not visible?
        </summary>
        <p className="mt-3">
          Changes to approved listings require Admin review. The Changes tab
          shows pending requests and rejection reasons.
        </p>
      </details>
      <details className="rounded-xl border p-5">
        <summary className="font-semibold">
          How do cancellations and refunds work?
        </summary>
        <p className="mt-3">
          Customers receive a full refund before the reserved start; no refund
          afterward. Partner cancellations request a full refund. Pending
          refunds are shown separately from processed refunds in Payments &
          Revenue.
        </p>
      </details>
      <TicketList tickets={tickets.items} canRespond={canRespond} />
      <ListPagination
        page={tickets}
        path="/support"
        params={params}
        noun="tickets"
      />
    </div>
  );
}
