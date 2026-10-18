"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  getCurrentSession,
  getSessionPartnerId,
  isPlatformStaff,
} from "@/lib/rbac";

export async function listSupportTickets() {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("Not authenticated");
  const staff = isPlatformStaff(session);
  const partnerId = await getSessionPartnerId(session);
  return prisma.supportTicket.findMany({
    where: staff ? {} : { partnerId, userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}
export async function createSupportTicket(input: {
  subject: string;
  message: string;
}) {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("Not authenticated");
  const data = z
    .object({
      subject: z.string().trim().min(3).max(150),
      message: z.string().trim().min(10).max(5000),
    })
    .parse(input);
  const partnerId = await getSessionPartnerId(session);
  await prisma.supportTicket.create({
    data: { ...data, userId: session.user.id, partnerId },
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
    throw new Error("Support staff access required");
  const text = z.string().trim().min(3).max(5000).parse(response);
  await prisma.supportTicket.update({
    where: { id },
    data: { status: "RESOLVED", response: text, respondedBy: session.user.id },
  });
  revalidatePath("/support");
}
