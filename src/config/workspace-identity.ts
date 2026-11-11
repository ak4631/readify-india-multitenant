// Presentation only. Authorization remains in server-side RBAC.
export function getWorkspaceIdentity(roles: string[]) {
  // Tenant/customer identities take precedence over mixed platform role grants.
  if (roles.includes("PARTNER_ADMIN"))
    return { tone: "admin", label: "Partner Admin" } as const;
  if (roles.includes("PARTNER_EMPLOYEE"))
    return { tone: "user", label: "Partner Team" } as const;
  if (roles.includes("USER")) return { tone: "user", label: "User" } as const;
  if (roles.includes("SUPER_ADMIN"))
    return { tone: "super-admin", label: "Super Admin" } as const;
  if (
    roles.some((role) =>
      ["ADMIN", "SUPPORT", "VENDOR_MANAGER", "CONTENT_MODERATOR"].includes(
        role,
      ),
    )
  )
    return { tone: "admin", label: "Admin" } as const;
  return { tone: "user", label: "User" } as const;
}
