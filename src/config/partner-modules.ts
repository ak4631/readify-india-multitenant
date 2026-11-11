import type { PermissionKey } from "@/config/permissions";
export const PARTNER_MODULES: {
  key: string;
  label: string;
  permission: PermissionKey;
}[] = [
  { key: "overview", label: "Overview", permission: "partner.read" },
  { key: "vendors", label: "Listings", permission: "vendor.read" },
  { key: "plans", label: "Plans", permission: "vendor.read" },
  {
    key: "subscriptions",
    label: "Subscriptions",
    permission: "subscription.read",
  },
  { key: "bookings", label: "Bookings", permission: "vendor.read" },
  { key: "customers", label: "Customers", permission: "customer.read" },
  {
    key: "service-management",
    label: "Service management",
    permission: "vendor.read",
  },
  { key: "payments", label: "Payments", permission: "subscription.read" },
  { key: "reviews", label: "Reviews", permission: "review.read" },
  { key: "team", label: "Team", permission: "partnerUser.read" },
  { key: "approvals", label: "Approvals", permission: "vendor.read" },
  { key: "support", label: "Support", permission: "vendor.read" },
  { key: "history", label: "History", permission: "auditLog.read" },
];
