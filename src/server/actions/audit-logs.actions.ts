"use server";

import { pageWindow, toPage } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

async function local_listAuditLogs(
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

export async function listAuditLogs(
  ...args: Parameters<typeof local_listAuditLogs>
): Promise<Awaited<ReturnType<typeof local_listAuditLogs>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listAuditLogs>>>(
      "audit-logs.actions.listAuditLogs",
      args,
    );
  }
  return local_listAuditLogs(...args);
}
