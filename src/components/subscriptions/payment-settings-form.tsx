"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { actionClient } from "@/lib/action-client";
import { savePaymentSettings as serverAction_savePaymentSettings } from "@/server/actions/payment-settings.actions";
const savePaymentSettings = actionClient(serverAction_savePaymentSettings);
export function PaymentSettingsForm({
  initial,
}: {
  initial: {
    onlineEnabled: boolean;
    offlineEnabled: boolean;
    offlineHoldHours: number;
  };
}) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <form
      className="space-y-3 rounded-xl border p-5"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          try {
            await savePaymentSettings(value);
            toast.success("Payment options updated");
            router.refresh();
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Could not save",
            );
          }
        });
      }}
    >
      <h2 className="font-semibold">Booking payment options</h2>
      <label className="block">
        <input
          type="checkbox"
          checked={value.onlineEnabled}
          onChange={(e) =>
            setValue({ ...value, onlineEnabled: e.target.checked })
          }
        />{" "}
        Online payment (Razorpay)
      </label>
      <label className="block">
        <input
          type="checkbox"
          checked={value.offlineEnabled}
          onChange={(e) =>
            setValue({ ...value, offlineEnabled: e.target.checked })
          }
        />{" "}
        Pay at Partner
      </label>
      <label className="block">
        Offline payment deadline:{" "}
        <input
          aria-label="Offline hold hours"
          type="number"
          min={1}
          max={72}
          required
          value={value.offlineHoldHours}
          onChange={(e) =>
            setValue({ ...value, offlineHoldHours: Number(e.target.value) })
          }
          className="w-20 rounded border p-2"
        />{" "}
        hours after booked start
      </label>
      <p className="text-sm text-muted-foreground">
        Unpaid reservations release capacity after their deadline. Changes apply
        to new checkouts; existing payments continue processing.
      </p>
      {!value.onlineEnabled && !value.offlineEnabled && (
        <p role="alert" className="text-sm text-destructive">
          Keep at least one payment method enabled.
        </p>
      )}
      <Button
        type="submit"
        aria-busy={pending}
        disabled={pending || (!value.onlineEnabled && !value.offlineEnabled)}
      >
        {pending ? "Saving…" : "Save payment options"}
      </Button>
    </form>
  );
}
