"use server";

import { revalidatePath } from "next/cache";
import { pageWindow, toPage } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/rbac";

export async function listPortalNotifications(page = 1) {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("Not authenticated");
  const where = { userId: session.user.id };
  const window = pageWindow(page);
  const [items, total] = await Promise.all([
    prisma.portalNotification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: window.skip,
      take: window.take,
    }),
    prisma.portalNotification.count({ where }),
  ]);
  return toPage(items, total, window);
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
