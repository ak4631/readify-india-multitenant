import { getServerSession, type Session } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import type { PermissionKey } from "@/config/permissions";
import { prisma } from "@/lib/prisma";

export async function getCurrentSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}

export function hasPermission(
  session: Session | null,
  permission: PermissionKey,
): boolean {
  return session?.user?.permissions?.includes(permission) ?? false;
}

// Call at the top of every Server Action. Throws if unauthenticated/unauthorized
// so the mutation never runs — this is the real security boundary, not the UI.
export async function requirePermission(
  permission: PermissionKey,
): Promise<Session> {
  const session = await getCurrentSession();
  if (!session?.user) {
    throw new Error("Not authenticated");
  }
  if (!hasPermission(session, permission)) {
    throw new Error(`Missing permission: ${permission}`);
  }
  return session;
}

// For use in Server Components/pages where an unauthorized visit should
// redirect rather than throw.
export async function requirePermissionOrRedirect(
  permission: PermissionKey,
): Promise<Session> {
  const session = await getCurrentSession();
  if (!session?.user) {
    redirect("/login");
  }
  if (!hasPermission(session, permission)) {
    redirect("/403");
  }
  return session;
}

export function isSuperAdmin(session: Session): boolean {
  return session.user.roles.includes("SUPER_ADMIN");
}

export async function requireSuperAdmin(): Promise<Session> {
  const session = await getCurrentSession();
  if (!session?.user) throw new Error("Not authenticated");
  if (!isSuperAdmin(session)) throw new Error("Super admin access required");
  return session;
}

export async function requirePartnerAccess(
  partnerId: string,
  permission: PermissionKey,
): Promise<Session> {
  const session = await requirePermission(permission);
  if (isSuperAdmin(session)) return session;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { partnerId: true, partner: { select: { status: true } } },
  });
  if (
    !user?.partnerId ||
    user.partnerId !== partnerId ||
    user.partner?.status !== "ACTIVE"
  ) {
    throw new Error("You do not have access to this partner");
  }
  return session;
}

export async function requireVendorAccess(
  vendorId: string,
  permission: PermissionKey,
): Promise<Session> {
  const session = await requirePermission(permission);
  if (isSuperAdmin(session)) return session;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { partnerId: true, partner: { select: { status: true } } },
  });
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { partnerId: true },
  });

  if (
    !user?.partnerId ||
    !vendor ||
    vendor.partnerId !== user.partnerId ||
    user.partner?.status !== "ACTIVE"
  ) {
    throw new Error("You do not have access to this listing");
  }
  return session;
}

export async function getAccessibleVendorIds(
  session: Session,
): Promise<string[] | null> {
  if (isSuperAdmin(session)) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { partnerId: true },
  });
  if (!user?.partnerId) return [];
  const vendors = await prisma.vendor.findMany({
    where: { partnerId: user.partnerId },
    select: { id: true },
  });
  return vendors.map((vendor) => vendor.id);
}
