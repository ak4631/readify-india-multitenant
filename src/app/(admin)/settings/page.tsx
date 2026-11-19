import { getCurrentSession, isSuperAdmin } from "@/lib/rbac";
import { getPaymentSettings } from "@/lib/payment-settings";
import { PaymentSettingsForm } from "@/components/subscriptions/payment-settings-form";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { ListPagination } from "@/components/layout/list-pagination";
import { parsePage } from "@/lib/pagination";
import { listVendorsPage } from "@/server/actions/vendors.actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const session = await getCurrentSession();
  const paymentSettings =
    session && isSuperAdmin(session) ? await getPaymentSettings() : null;
  const vendors = await listVendorsPage({ page: parsePage(params.page) });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Business profiles, operating hours and launch policies."
      />
      {paymentSettings && <PaymentSettingsForm initial={paymentSettings} />}
      <section className="space-y-2 rounded-xl border p-5">
        <h2 className="font-semibold">Booking and cancellation rules</h2>
        <p>
          Customer cancellation: full refund before the reserved start; no
          refund afterward. Partner cancellations request a full refund.
        </p>
        <p>
          Online checkout holds last up to 15 minutes. Pay at Partner bookings
          use their displayed payment deadline. New memberships require payment
          confirmation and in-person customer verification.
        </p>
        <p>
          Each checkout includes a ₹6 customer fee. Partner commission and
          payouts require platform configuration.
        </p>
        <p>
          Owner-defined subscription windows hold the same seat for the term.
          Flex spans cannot include closed days.
        </p>
      </section>
      {vendors.items.map((vendor) => (
        <section key={vendor.id} className="space-y-2 rounded-xl border p-5">
          <h2 className="font-semibold">{vendor.name}</h2>
          <div className="flex flex-wrap gap-4">
            {[
              ["overview", "Profile and location"],
              ["schedule", "Operating hours"],
              ["changes", "Proposed changes"],
            ].map(([tab, label]) => (
              <Link
                key={tab}
                href={`/vendors/${vendor.id}?tab=${tab}`}
                className="text-primary underline"
              >
                {label}
              </Link>
            ))}
          </div>
        </section>
      ))}
      <ListPagination
        page={vendors}
        path="/settings"
        params={params}
        noun="listings"
      />
    </div>
  );
}
