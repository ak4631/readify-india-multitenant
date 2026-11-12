"use server";

import { PublicActionError } from "@/lib/public-action-error";
import { writeAuditLog } from "@/lib/audit";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { pageWindow, toPage } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import {
  getCurrentSession,
  getSessionPartnerId,
  isPlatformStaff,
} from "@/lib/rbac";

export async function listSupportTickets(page = 1, selectedPartnerId?: string) {
  const session = await getCurrentSession();
  if (!session?.user) throw new PublicActionError("Not authenticated");
  const staff = isPlatformStaff(session);
  const partnerId = await getSessionPartnerId(session, selectedPartnerId);
  const where = staff
    ? partnerId
      ? { partnerId }
      : {}
    : { partnerId, userId: session.user.id };
  const window = pageWindow(page);
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: window.skip,
      take: window.take,
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return toPage(items, total, window);
}
export async function createSupportTicket(input: {
  subject: string;
  message: string;
  partnerId?: string;
}) {
  const session = await getCurrentSession();
  if (!session?.user) throw new PublicActionError("Not authenticated");
  const data = z
    .object({
      subject: z.string().trim().min(3).max(150),
      message: z.string().trim().min(10).max(5000),
    })
    .parse(input);
  const partnerId = await getSessionPartnerId(session, input.partnerId);
  await prisma.$transaction(async (tx) => {
    const ticket = await tx.supportTicket.create({
      data: { ...data, userId: session.user.id, partnerId },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      partnerId: partnerId ?? undefined,
      action: "SUPPORT_CREATE",
      entityType: "support",
      entityId: ticket.id,
    });
  });
  revalidatePath("/support");
}
export async function resolveSupportTicket(id: string, response: string) {
  const session = await getCurrentSession();
  if (
    !session?.user ||
    !isPlatformStaff(session) ||
    !session.user.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(role),
    )
  )
    throw new PublicActionError("Support staff access required");
  const text = z.string().trim().min(3).max(5000).parse(response);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM admin.support_tickets WHERE id=${id} FOR UPDATE`;
    const current = await tx.supportTicket.findUniqueOrThrow({ where: { id } });
    if (current.status === "RESOLVED") {
      if (current.response === text) return;
      throw new PublicActionError(
        "This ticket is already resolved; its response cannot be overwritten",
      );
    }
    await tx.supportTicket.update({
      where: { id },
      data: {
        status: "RESOLVED",
        response: text,
        respondedBy: session.user.id,
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      partnerId: current.partnerId ?? undefined,
      action: "SUPPORT_RESOLVE",
      entityType: "support",
      entityId: id,
    });
  });
  revalidatePath("/support");
}
