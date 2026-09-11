"use server";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";

export async function listAuditLogs(filters: { entityType?: string } = {}) {
  await requirePermission("auditLog.read");

  return prisma.auditLog.findMany({
    where: { entityType: filters.entityType },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: true },
  });
}
