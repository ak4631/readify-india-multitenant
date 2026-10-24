"use server";

import { pageWindow, toPage } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function listAuditLogs(
  filters: { entityType?: string; page?: number } = {},
) {
  await requirePermission("auditLog.read");
  const where = { entityType: filters.entityType || undefined };
  const window = pageWindow(filters.page ?? 1);

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: window.skip,
      take: window.take,
      include: { user: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return toPage(items, total, window);
}
