import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/rbac";

export async function requireOwner() {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("Not authenticated");
  if (
    !session.user.roles.includes("PARTNER_ADMIN") ||
    session.user.roles.includes("PARTNER_EMPLOYEE")
  )
    throw new Error("Owner access required");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      partnerId: true,
      status: true,
      partner: { select: { status: true } },
    },
  });
  if (
    !user?.partnerId ||
    user.status !== "ACTIVE" ||
    user.partner?.status !== "ACTIVE"
  )
    throw new Error("Active partner owner access required");
  return { session, partnerId: user.partnerId };
}
