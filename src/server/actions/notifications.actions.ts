"use server";

import { PublicActionError } from "@/lib/public-action-error";

import { revalidatePath } from "next/cache";
import { pageWindow, toPage } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/rbac";

async function local_listPortalNotifications(page = 1) {
  const session = await getCurrentSession();
  if (!session?.user) throw new PublicActionError("Not authenticated");
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

async function local_markPortalNotificationRead(id: string) {
  const session = await getCurrentSession();
  if (!session?.user) throw new PublicActionError("Not authenticated");
  await prisma.portalNotification.updateMany({
    where: { id, userId: session.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

export async function listPortalNotifications(
  ...args: Parameters<typeof local_listPortalNotifications>
): Promise<Awaited<ReturnType<typeof local_listPortalNotifications>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_listPortalNotifications>>
    >("notifications.actions.listPortalNotifications", args);
  }
  return local_listPortalNotifications(...args);
}

export async function markPortalNotificationRead(
  ...args: Parameters<typeof local_markPortalNotificationRead>
): Promise<Awaited<ReturnType<typeof local_markPortalNotificationRead>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_markPortalNotificationRead>>
    >("notifications.actions.markPortalNotificationRead", args);
  }
  return local_markPortalNotificationRead(...args);
}
