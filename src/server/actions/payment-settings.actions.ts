"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";

export async function savePaymentSettings(input: unknown) {
  const session = await requireSuperAdmin();
  const data = z
    .object({
      onlineEnabled: z.boolean(),
      offlineEnabled: z.boolean(),
      offlineHoldHours: z.number().int().min(1).max(72),
    })
    .refine((v) => v.onlineEnabled || v.offlineEnabled, {
      message: "Keep at least one payment method enabled.",
    })
    .parse(input);
  await prisma.$transaction(async (tx) => {
    const before = await tx.paymentSettings.findUnique({
      where: { id: "platform" },
    });
    await tx.paymentSettings.upsert({
      where: { id: "platform" },
      create: { id: "platform", ...data },
      update: data,
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "UPDATE_PAYMENT_SETTINGS",
      entityType: "payment_settings",
      entityId: "platform",
      oldValue: before,
      newValue: data,
    });
  });
  revalidatePath("/settings");
}
