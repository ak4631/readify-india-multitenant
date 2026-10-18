import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { listVendors } from "@/server/actions/vendors.actions";

export default async function SettingsPage() {
  const vendors = await listVendors();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Business profiles, operating hours and launch policies."
      />
      <section className="space-y-2 rounded-xl border p-5">
        <h2 className="font-semibold">Booking and cancellation rules</h2>
        <p>
          Customer cancellation: full refund before the reserved start; no
          refund afterward. Partner cancellations request a full refund.
        </p>
        <p>
          Checkout holds last up to 15 minutes. Access starts only after payment
          capture is verified.
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
      {vendors.map((vendor) => (
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
    </div>
  );
}
