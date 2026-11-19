import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export async function getPaymentSettings(
  db: Prisma.TransactionClient = prisma,
) {
  return (
    (await db.paymentSettings.findUnique({ where: { id: "platform" } })) ?? {
      onlineEnabled: true,
      offlineEnabled: true,
      offlineHoldHours: 24,
    }
  );
}
