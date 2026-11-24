import type { BookingCustomerSnapshot } from "@/lib/booking-customer-snapshots";
export function BookingCustomerInfo({
  details,
}: {
  details?: BookingCustomerSnapshot;
}) {
  if (!details) return null;
  return (
    <div className="mt-1 space-y-1 text-xs text-muted-foreground">
      <p>
        <a href={`tel:${details.phone}`} className="hover:underline">
          {details.phone}
        </a>{" "}
        ·{" "}
        {details.verificationMethod === "static"
          ? "Test OTP check"
          : "Mobile verified"}
      </p>
      <p>
        {details.education} · {details.purpose}
      </p>
      {details.requirements && (
        <p className="max-w-xs whitespace-pre-wrap break-words">
          {details.requirements}
        </p>
      )}
    </div>
  );
}
