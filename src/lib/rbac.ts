import { PublicActionError } from "@/lib/public-action-error";
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
    throw new PublicActionError("Not authenticated");
  }
  if (!hasPermission(session, permission)) {
    throw new PublicActionError(`Missing permission: ${permission}`);
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
  return isPlatformStaff(session) && session.user.roles.includes("SUPER_ADMIN");
}

export function isPlatformStaff(session: Session): boolean {
  // A detached partner account must never become a platform account merely
  // because its partner_id was cleared.
  return (
    !session.user.roles.some((role) =>
      ["PARTNER_ADMIN", "PARTNER_EMPLOYEE", "USER"].includes(role),
    ) &&
    session.user.roles.some((role) =>
      [
        "SUPER_ADMIN",
        "ADMIN",
        "SUPPORT",
        "VENDOR_MANAGER",
        "CONTENT_MODERATOR",
      ].includes(role),
    )
  );
}

export async function requirePlatformPermission(permission: PermissionKey) {
  const session = await requirePermission(permission);
  if (!isPlatformStaff(session))
    throw new PublicActionError("Platform staff access required");
  return session;
}

export async function requireSuperAdmin(): Promise<Session> {
  const session = await getCurrentSession();
  if (!session?.user) throw new PublicActionError("Not authenticated");
  if (!isSuperAdmin(session))
    throw new PublicActionError("Super admin access required");
  return session;
}

export async function requireSuperAdminPermission(permission: PermissionKey) {
  const session = await requirePlatformPermission(permission);
  if (!isSuperAdmin(session))
    throw new PublicActionError("Super admin access required");
  return session;
}

export type DataScope =
  | { kind: "platform"; partnerId: null }
  | { kind: "partner"; partnerId: string };

// A selected partner narrows a platform query; it never overrides tenant access.
// Inactive partners remain inspectable by platform staff for remediation.
export async function resolveDataScope(
  session: Session,
  selectedPartnerId?: string,
): Promise<DataScope> {
  if (
    selectedPartnerId !== undefined &&
    (typeof selectedPartnerId !== "string" ||
      !selectedPartnerId.trim() ||
      selectedPartnerId.length > 128)
  ) {
    throw new PublicActionError("Invalid partner selection");
  }
  if (isPlatformStaff(session)) {
    if (selectedPartnerId === undefined)
      return { kind: "platform", partnerId: null };
    const partner = await prisma.partner.findUnique({
      where: { id: selectedPartnerId },
      select: { id: true },
    });
    if (!partner) throw new PublicActionError("Partner not found");
    return { kind: "partner", partnerId: partner.id };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      partnerId: true,
      status: true,
      partner: { select: { status: true, approvalStatus: true } },
    },
  });
  if (
    !user?.partnerId ||
    user.status !== "ACTIVE" ||
    user.partner?.status !== "ACTIVE" ||
    user.partner.approvalStatus !== "APPROVED"
  ) {
    throw new PublicActionError("Active partner access required");
  }
  if (selectedPartnerId !== undefined && selectedPartnerId !== user.partnerId) {
    throw new PublicActionError("You do not have access to this partner");
  }
  return { kind: "partner", partnerId: user.partnerId };
}

export async function requirePartnerAccess(
  partnerId: string,
  permission: PermissionKey,
): Promise<Session> {
  const session = await requirePermission(permission);
  await resolveDataScope(session, partnerId);
  return session;
}

export async function requireVendorAccess(
  vendorId: string,
  permission: PermissionKey,
): Promise<Session> {
  const session = await requirePermission(permission);
  if (isPlatformStaff(session)) return session;
  const scope = await resolveDataScope(session);
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { partnerId: true },
  });

  if (!vendor || vendor.partnerId !== scope.partnerId) {
    throw new PublicActionError("You do not have access to this listing");
  }
  return session;
}

// Null for platform staff (SUPER_ADMIN, ADMIN, SUPPORT, ...) who aren't tied
// to any one partner and should see data across all of them; the partner id
// for a partner-side account, so its data can be scoped to just their own
// listings (customers, subscriptions, ...).
export async function getSessionPartnerId(
  session: Session,
  selectedPartnerId?: string,
): Promise<string | null> {
  return (await resolveDataScope(session, selectedPartnerId)).partnerId;
}

export async function getAccessibleVendorIds(
  session: Session,
  selectedPartnerId?: string,
): Promise<string[] | null> {
  const scope = await resolveDataScope(session, selectedPartnerId);
  if (scope.kind === "platform") return null;
  const vendors = await prisma.vendor.findMany({
    where: { partnerId: scope.partnerId },
    select: { id: true },
  });
  return vendors.map((vendor) => vendor.id);
}
