import type { PermissionKey } from "@/config/permissions";
import {
  BarChart3,
  Bell,
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
  ownerOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Bookings",
    href: "/bookings",
    requiredPermission: "vendor.read",
    icon: ClipboardCheck,
  },
  {
    label: "Plans & Subscriptions",
    href: "/plans",
    requiredPermission: "vendor.read",
    icon: CreditCard,
  },
  {
    label: "Service Management",
    href: "/service-management",
    requiredPermission: "vendor.read",
    icon: Store,
  },
  {
    label: "Payments & Revenue",
    href: "/payments",
    requiredPermission: "subscription.read",
    icon: CreditCard,
  },
  {
    label: "Team Members",
    href: "/team",
    requiredPermission: "partnerUser.read",
    icon: Users,
  },
  {
    label: "Control Panel",
    href: "/control-panel",
    requiredPermission: "vendor.read",
    icon: BarChart3,
    ownerOnly: true,
  },
  {
    label: "Settings",
    href: "/settings",
    requiredPermission: "vendor.read",
    icon: Building2,
  },
  {
    label: "Help & Support",
    href: "/support",
    requiredPermission: "vendor.read",
    icon: UserRound,
  },
  {
    label: "Notifications",
    href: "/notifications",
    requiredPermission: "vendor.read",
    icon: Bell,
  },
  {
    label: "Dashboard",
    href: "/dashboard",
    requiredPermission: "dashboard.read",
    icon: BarChart3,
  },
  {
    label: "Partners",
    href: "/partners",
    requiredPermission: "partner.read",
    icon: Building2,
    platformOnly: true,
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
  },
  {
    label: "Subscriptions",
    href: "/subscriptions",
    requiredPermission: "subscription.read",
    icon: CreditCard,
    platformOnly: true,
  },
  {
    label: "Audit Logs",
    href: "/audit-logs",
    requiredPermission: "auditLog.read",
    icon: History,
    platformOnly: true,
  },
];

const PARTNER_MODULE_ORDER = [
  "/dashboard",
  "/vendors",
  "/bookings",
  "/customers",
  "/plans",
  "/service-management",
  "/payments",
  "/reviews",
  "/team",
  "/notifications",
  "/control-panel",
  "/settings",
  "/support",
];

export function visibleNavigation(
  permissions: PermissionKey[],
  roles: string[],
) {
  const partner = roles.some((role) =>
    ["PARTNER_ADMIN", "PARTNER_EMPLOYEE"].includes(role),
  );
  const items = NAV_ITEMS.filter(
    (item) =>
      permissions.includes(item.requiredPermission) &&
      (!item.ownerOnly ||
        (roles.includes("PARTNER_ADMIN") &&
          !roles.includes("PARTNER_EMPLOYEE"))) &&
      !(partner && item.platformOnly),
  );
  return partner
    ? items.sort(
        (a, b) =>
          PARTNER_MODULE_ORDER.indexOf(a.href) -
          PARTNER_MODULE_ORDER.indexOf(b.href),
      )
    : items;
}
