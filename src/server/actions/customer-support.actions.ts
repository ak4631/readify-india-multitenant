"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentSession, isPlatformStaff } from "@/lib/rbac";
import { PublicActionError } from "@/lib/public-action-error";
import { writeAuditLog } from "@/lib/audit";
async function requireSupport() {
  const session = await getCurrentSession();
  if (
    !session ||
    !isPlatformStaff(session) ||
    !session.user.roles.some((role) =>
      ["SUPER_ADMIN", "ADMIN", "SUPPORT"].includes(role),
    )
  )
    throw new PublicActionError("Support staff access required");
  return session;
}
async function local_listCustomerSupportTickets() {
  await requireSupport();
  return prisma.customerSupportTicket.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
}
async function local_respondToCustomerTicket(id: string, response: string) {
  const session = await requireSupport();
  const text = z.string().trim().min(3).max(5000).parse(response);
  await prisma.$transaction(async (tx) => {
    const updated = await tx.customerSupportTicket.updateMany({
      where: { id, status: "OPEN" },
      data: {
        response: text,
        status: "RESOLVED",
        respondedBy: session.user.id,
      },
    });
    if (!updated.count)
      throw new PublicActionError("Ticket already resolved or not found");
    await tx.customerNotification.create({
      data: {
        userId: (
          await tx.customerSupportTicket.findUniqueOrThrow({ where: { id } })
        ).userId,
        eventKey: `support-response:${id}`,
        title: "Support replied",
        body: "Your support ticket has a response. Open Help & Support to read it.",
      },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "SUPPORT_RESOLVE",
      entityType: "customer_support",
      entityId: id,
    });
  });
  revalidatePath("/support");
}

export async function listCustomerSupportTickets(
  ...args: Parameters<typeof local_listCustomerSupportTickets>
): Promise<Awaited<ReturnType<typeof local_listCustomerSupportTickets>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_listCustomerSupportTickets>>
    >("customer-support.actions.listCustomerSupportTickets", args);
  }
  return local_listCustomerSupportTickets(...args);
}

export async function respondToCustomerTicket(
  ...args: Parameters<typeof local_respondToCustomerTicket>
): Promise<Awaited<ReturnType<typeof local_respondToCustomerTicket>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_respondToCustomerTicket>>
    >("customer-support.actions.respondToCustomerTicket", args);
  }
  return local_respondToCustomerTicket(...args);
}
