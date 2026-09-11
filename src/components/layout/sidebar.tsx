"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "@/config/nav";
import type { PermissionKey } from "@/config/permissions";
import { cn } from "@/lib/utils";

export function Sidebar({
  permissions,
  roles,
}: {
  permissions: PermissionKey[];
  roles: string[];
}) {
  const pathname = usePathname();
  const isVendorAccount = roles.some((role) =>
    ["PARTNER_ADMIN", "PARTNER_EMPLOYEE"].includes(role),
  );
  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      permissions.includes(item.requiredPermission) &&
      !(isVendorAccount && item.platformOnly),
  );

  return (
    <aside className="hidden min-h-svh w-72 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[12px_0_32px_oklch(0.2_0.03_170_/_0.08)] md:flex md:flex-col">
      <div className="border-b border-sidebar-border px-5 py-5">
        <Link
          href={
            permissions.includes("dashboard.read") ? "/dashboard" : "/vendors"
          }
          className="flex items-center gap-3"
        >
          <Image
            src="/readify-logo.jpg"
            alt="Readify India"
            width={40}
            height={40}
            className="size-10 rounded-lg border border-sidebar-border bg-white object-contain shadow-sm"
            priority
          />
          <span>
            <span className="block text-lg font-semibold tracking-tight text-sidebar-foreground">
              Readify India
            </span>
            <span className="mt-0.5 block text-xs font-medium text-sidebar-foreground/60">
              Management Portal
            </span>
          </span>
        </Link>
      </div>
      <div className="flex-1 p-4">
        <p className="mb-3 px-3 text-xs font-semibold tracking-[0.08em] text-sidebar-foreground/45 uppercase">
          Workspace
        </p>
        <nav className="space-y-1.5">
          {visibleItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/62 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
