"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/layout/brand-logo";
import { visibleNavigation } from "@/config/nav";
import { getWorkspaceIdentity } from "@/config/workspace-identity";
import type { PermissionKey } from "@/config/permissions";
import { cn } from "@/lib/utils";
import { Building2, LogOut, ShieldCheck, UserRound } from "lucide-react";

export function Topbar({
  name,
  email,
  permissions,
  roles,
  organizationName,
}: {
  name: string;
  email: string;
  permissions: PermissionKey[];
  roles: string[];
  organizationName?: string | null;
}) {
  const pathname = usePathname();
  const identity = getWorkspaceIdentity(roles);
  const RoleIcon = identity.tone === "user" ? UserRound : ShieldCheck;
  const initials = name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const visibleItems = visibleNavigation(permissions, roles);
  return (
    <header
      className="workspace-header sticky top-0 z-20 border-b"
      data-workspace-role={identity.tone}
      aria-label={`${identity.label} workspace header`}
    >
      <div className="flex min-h-20 items-center justify-between gap-3 px-4 py-3 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogo className="w-24 p-1 md:hidden" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-heading text-sm font-bold sm:text-base">
              <RoleIcon
                className="hidden size-4 shrink-0 sm:block"
                aria-hidden="true"
              />
              <span>{identity.label}</span>
            </div>
            <p className="mt-1 flex items-center gap-1 text-xs">
              {organizationName && (
                <Building2
                  className="hidden size-3 shrink-0 sm:block"
                  aria-hidden="true"
                />
              )}
              <span className="max-w-32 truncate sm:max-w-56">
                {organizationName ?? "ZEROTHAM Workspace"}
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden text-right text-sm lg:block">
            <div className="font-semibold">{name}</div>
            <div className="max-w-64 truncate text-xs">{email}</div>
          </div>
          <Avatar className="hidden sm:flex">
            <AvatarFallback className="workspace-avatar">
              {initials}
            </AvatarFallback>
          </Avatar>
          <Button
            variant="outline"
            size="sm"
            className="workspace-sign-out gap-1.5"
            aria-label="Sign out"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
      <nav
        aria-label="Workspace navigation"
        className="workspace-mobile-nav flex gap-1 overflow-x-auto border-t px-4 py-2 md:hidden"
      >
        {visibleItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "workspace-nav-link inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap",
                active && "workspace-nav-active",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
