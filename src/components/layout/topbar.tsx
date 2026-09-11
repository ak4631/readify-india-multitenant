"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NAV_ITEMS } from "@/config/nav";
import type { PermissionKey } from "@/config/permissions";
import { cn } from "@/lib/utils";
import { Building2, LogOut } from "lucide-react";

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
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const isVendorAccount = roles.some((role) =>
    ["PARTNER_ADMIN", "PARTNER_EMPLOYEE"].includes(role),
  );
  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      permissions.includes(item.requiredPermission) &&
      !(isVendorAccount && item.platformOnly),
  );

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/90 shadow-[0_10px_28px_oklch(0.25_0.03_170_/_0.04)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-8">
        <div className="flex items-center gap-3 md:hidden">
          <Image
            src="/readify-logo.jpg"
            alt="Readify India"
            width={36}
            height={36}
            className="size-9 rounded-lg border border-border bg-white object-contain"
            priority
          />
          <div className="min-w-0">
            <p className="text-base font-semibold tracking-tight">
              Readify India
            </p>
            <p className="max-w-36 truncate text-xs font-medium text-muted-foreground">
              {organizationName ?? "Management Portal"}
            </p>
          </div>
        </div>
        <div className="hidden md:block" />
        <div className="flex items-center gap-3">
          <div className="hidden text-right text-sm sm:block">
            {organizationName && (
              <div className="mb-0.5 flex items-center justify-end gap-1 text-xs font-semibold text-primary">
                <Building2 className="size-3" aria-hidden="true" />
                <span className="max-w-56 truncate">{organizationName}</span>
              </div>
            )}
            <div className="font-semibold text-foreground">{name}</div>
            <div className="text-muted-foreground">{email}</div>
          </div>
          <Avatar>
            <AvatarFallback className="bg-secondary text-secondary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto border-t border-border px-4 py-2 md:hidden">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
