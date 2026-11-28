"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { visibleNavigation } from "@/config/nav";
import type { PermissionKey } from "@/config/permissions";
import { BrandLogo } from "@/components/layout/brand-logo";
import { cn } from "@/lib/utils";

export function Sidebar({
  permissions,
  roles,
}: {
  permissions: PermissionKey[];
  roles: string[];
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const visibleItems = visibleNavigation(permissions, roles);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 self-start overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[12px_0_32px_oklch(0.2_0.03_170_/_0.08)] transition-[width] duration-200 motion-reduce:transition-none md:flex md:flex-col",
        collapsed ? "w-20" : "w-72",
      )}
    >
      <div
        className={cn(
          "shrink-0 border-b border-sidebar-border py-4",
          collapsed ? "px-2" : "px-5",
        )}
      >
        <div
          className={cn(
            "mb-3 flex",
            collapsed ? "justify-center" : "justify-end",
          )}
        >
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="sidebar-navigation"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-sidebar-accent/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-5" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
        <Link
          href={
            permissions.includes("dashboard.read") ? "/dashboard" : "/vendors"
          }
          className="flex items-center gap-3"
          title={collapsed ? "ZEROTHAM Management Portal" : undefined}
        >
          <span className="block w-full">
            <BrandLogo
              className={cn(
                "mx-auto flex max-w-full",
                collapsed ? "w-14 p-1" : "w-24 p-1",
              )}
            />
            <span
              className={cn(
                "mt-2 block text-center text-xs font-medium text-sidebar-foreground",
                collapsed && "sr-only",
              )}
            >
              Management Portal
            </span>
          </span>
        </Link>
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain py-4",
          collapsed ? "px-2" : "px-4",
        )}
      >
        <p
          className={cn(
            "mb-3 px-3 text-xs font-semibold tracking-[0.08em] text-sidebar-foreground/80 uppercase",
            collapsed && "sr-only",
          )}
        >
          Workspace
        </p>
        <nav
          id="sidebar-navigation"
          aria-label="Workspace navigation"
          className="space-y-1.5"
        >
          {visibleItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                  collapsed && "justify-center",
                  isActive
                    ? "bg-[var(--brand-lime)] text-[var(--brand-forest)] shadow-sm"
                    : "text-sidebar-foreground/85 hover:bg-sidebar-accent/55 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className={collapsed ? "sr-only" : undefined}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
