"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { visibleNavigation } from "@/config/nav";
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
  const visibleItems = visibleNavigation(permissions, roles);

  return (
    <aside className="hidden min-h-svh w-72 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[12px_0_32px_oklch(0.2_0.03_170_/_0.08)] md:flex md:flex-col">
      <div className="border-b border-sidebar-border px-5 py-5">
        <Link
          href={
            permissions.includes("dashboard.read") ? "/dashboard" : "/vendors"
          }
          className="flex items-center gap-3"
        >
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-lg bg-primary text-xl font-bold text-primary-foreground"
          >
            V
          </span>
          <span>
            <span className="block text-lg font-semibold tracking-tight text-sidebar-foreground">
              Vriddhora
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
