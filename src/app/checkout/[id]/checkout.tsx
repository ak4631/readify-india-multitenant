"use client";

import Script from "next/script";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type Result = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open(): void };
  }
}

export function HostedCheckout({
  id,
  token,
  keyId,
  gatewayOrderId,
  amount,
}: {
  id: string;
  token: string;
  keyId: string;
  gatewayOrderId: string;
  amount: number;
}) {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  function pay() {
    const checkout = new window.Razorpay({
      key: keyId,
      order_id: gatewayOrderId,
      amount,
      currency: "INR",
      name: "Vriddhora",
      handler: async (result: Result) => {
        setMessage("Verifying your payment…");
        try {
          const response = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, token, ...result }),
          });
          setMessage(
            response.ok
              ? "Payment verified. Return to the Vriddhora app to see your booking."
              : "Verification is pending. Return to the app to check the latest status. Do not pay again.",
          );
        } catch {
          setMessage(
            "Verification is pending. Return to the app to check your payment. Do not pay again.",
          );
        }
      },
      modal: {
        ondismiss: () =>
          setMessage(
            "Checkout closed. You can retry before this reservation expires.",
          ),
      },
    });
    checkout.open();
  }
  return (
    <main className="mx-auto max-w-lg space-y-6 p-8">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        onReady={() => setReady(true)}
        onError={() =>
          setMessage("Could not load secure checkout. Please retry.")
        }
      />
      <h1 className="text-2xl font-semibold">Vriddhora checkout</h1>
      <p>Total: ₹{(amount / 100).toFixed(2)}</p>
      <p>
        Your seat is held for up to 15 minutes. Access is confirmed after
        payment verification.
      </p>
      <Button disabled={!ready} onClick={pay}>
        Continue to Razorpay
      </Button>
      <p role="status">{message}</p>
    </main>
  );
}
