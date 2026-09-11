"use client";

import { useSession } from "next-auth/react";
import type { PermissionKey } from "@/config/permissions";

// UX convenience only (hides buttons/nav items) — the real security boundary
// is requirePermission() inside each Server Action.
export function usePermission(permission: PermissionKey): boolean {
  const { data: session } = useSession();
  return session?.user?.permissions?.includes(permission) ?? false;
}
