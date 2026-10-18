import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { assertCheckoutToken } from "@/lib/payments";
import { paymentConfig } from "@/lib/razorpay";
import { HostedCheckout } from "./checkout";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Vriddhora checkout",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token = "" } = await searchParams;
  const order = await prisma.paymentOrder.findUnique({ where: { id } });
  if (!order) notFound();
  try {
    assertCheckoutToken(order, token);
  } catch {
    return (
      <main className="p-8">
        This checkout link has expired. Return to the app to check your payment
        status.
      </main>
    );
  }
  if (order.status !== "CREATED" || !order.gatewayOrderId)
    return (
      <main className="p-8">
        Checkout is {order.status.toLowerCase()}. Return to the app for your
        latest booking status.
      </main>
    );
  return (
    <HostedCheckout
      id={id}
      token={token}
      keyId={paymentConfig().keyId}
      gatewayOrderId={order.gatewayOrderId}
      amount={order.amountPaise}
    />
  );
}
