"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/rbac";

export async function listPortalNotifications() {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("Not authenticated");
  return prisma.portalNotification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function markPortalNotificationRead(id: string) {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("Not authenticated");
  await prisma.portalNotification.updateMany({
    where: { id, userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}
