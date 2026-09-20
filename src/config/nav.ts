import type { PermissionKey } from "@/config/permissions";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  CreditCard,
  FolderTree,
  History,
  Star,
  Store,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  requiredPermission: PermissionKey;
  icon: LucideIcon;
  platformOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    requiredPermission: "dashboard.read",
    icon: BarChart3,
    platformOnly: true,
  },
  {
    label: "Partners",
    href: "/partners",
    requiredPermission: "partner.read",
    icon: Building2,
  },
  {
    label: "Listings",
    href: "/vendors",
    requiredPermission: "vendor.read",
    icon: Store,
  },
  {
    label: "Listing Categories",
    href: "/vendor-categories",
    requiredPermission: "vendorCategory.read",
    icon: FolderTree,
    platformOnly: true,
  },
  {
    label: "Facilities",
    href: "/facilities",
    requiredPermission: "facility.read",
    icon: ClipboardCheck,
    platformOnly: true,
  },
  {
    label: "Reviews",
    href: "/reviews",
    requiredPermission: "review.read",
    icon: Star,
  },
  {
    label: "Users",
    href: "/users",
    requiredPermission: "user.read",
    icon: Users,
    platformOnly: true,
  },
  {
    label: "Customers",
    href: "/customers",
    requiredPermission: "customer.read",
    icon: UserRound,
    platformOnly: true,
  },
  {
    label: "Subscriptions",
    href: "/subscriptions",
    requiredPermission: "subscription.read",
    icon: CreditCard,
  },
  {
    label: "Audit Logs",
    href: "/audit-logs",
    requiredPermission: "auditLog.read",
    icon: History,
    platformOnly: true,
  },
];
