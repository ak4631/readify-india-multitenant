"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actionClient } from "@/lib/action-client";
import {
  reviewMembershipBooking as serverAction_reviewMembershipBooking,
  activateMembership as serverAction_activateMembership,
} from "@/server/actions/membership-activation.actions";
const reviewMembershipBooking = actionClient(
  serverAction_reviewMembershipBooking,
);
const activateMembership = actionClient(serverAction_activateMembership);
export function MembershipVerification({ targetId }: { targetId?: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(targetId ?? "");
  const [review, setReview] = useState<Awaited<
    ReturnType<typeof reviewMembershipBooking>
  > | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function run(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not complete verification",
        );
      }
    });
  }
  if (!open)
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
          if (targetId)
            run(async () => setReview(await reviewMembershipBooking(targetId)));
        }}
      >
        Verify / activate
      </Button>
    );
  return (
    <section className="space-y-3 rounded-lg border p-4 text-left min-w-64">
      <h3 className="font-semibold">Customer verification</h3>
      {!targetId && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => setReview(await reviewMembershipBooking(code)));
          }}
        >
          <Input
            aria-label="Booking ID or QR"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setReview(null);
            }}
            placeholder="Booking ID / existing QR"
            required
          />
          <Button type="submit" disabled={pending}>
            Find
          </Button>
        </form>
      )}
      {review && (
        <>
          <p className="font-medium">
            {review.customerName} · {review.vendorName}
          </p>
          <p className="text-sm">Booking: {review.targetId}</p>
          <p className="text-sm">
            {review.planName} · Daily slot:{" "}
            {review.slotLabel ?? "See booking details"}
          </p>
          <p className="text-sm">
            ₹{review.amount.toFixed(2)} · {review.paymentMethod} ·{" "}
            {review.paymentStatus}
          </p>
          <p className="text-sm">
            Booked start:{" "}
            {new Date(review.startsAt).toLocaleString("en-IN", {
              timeZone: review.timeZone,
            })}
          </p>
          {review.paymentStatus === "CREATED" && (
            <p className="text-sm">
              Payment deadline:{" "}
              {new Date(review.expiresAt).toLocaleString("en-IN", {
                timeZone: review.timeZone,
              })}
            </p>
          )}
          {review.activated ? (
            <>
              <p className="text-sm font-medium">
                Membership already verified and activated.
              </p>
              {/* Private signed URL is issued only after location access is checked. */}
              {review.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={review.photoUrl}
                  alt="Verified customer"
                  className="h-24 w-24 rounded object-cover"
                />
              )}
            </>
          ) : (
            <form
              className="space-y-3"
              action={(data) =>
                run(async () => {
                  await activateMembership(data);
                  toast.success("Membership activated");
                  setOpen(false);
                  setReview(null);
                  router.refresh();
                })
              }
            >
              <input type="hidden" name="targetId" value={review.targetId} />
              <label className="block text-sm">
                <input type="checkbox" name="customerVerified" required /> I
                verified this customer&apos;s identity in person.
              </label>
              <label className="block text-sm">
                Customer selfie (JPG/PNG, up to 4 MB)
                <Input
                  type="file"
                  name="selfie"
                  accept="image/jpeg,image/png"
                  capture="user"
                  required
                />
              </label>
              {review.paymentMethod === "OFFLINE" ? (
                <label className="block text-sm">
                  <input type="checkbox" name="paymentReceived" required /> I
                  received ₹{review.amount.toFixed(2)} at this location.
                </label>
              ) : (
                <p className="text-sm">
                  Online payment must be confirmed by the gateway before
                  activation.
                </p>
              )}
              <Button
                type="submit"
                disabled={
                  pending ||
                  !["CREATED", "CAPTURED"].includes(review.paymentStatus) ||
                  (review.paymentMethod === "ONLINE" &&
                    review.paymentStatus !== "CAPTURED")
                }
              >
                {pending
                  ? "Activating…"
                  : review.paymentMethod === "OFFLINE"
                    ? "Confirm Payment & Activate"
                    : "Verify & Activate"}
              </Button>
            </form>
          )}
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          setOpen(false);
          setReview(null);
        }}
      >
        Close
      </Button>
    </section>
  );
}
