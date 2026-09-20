export const PERMISSIONS = [
  { key: "partner.create", description: "Create partner organizations" },
  { key: "partner.read", description: "View partner organizations" },
  { key: "partner.update", description: "Edit partner organizations" },
  { key: "partner.status", description: "Activate or deactivate partners" },
  { key: "partnerUser.read", description: "View partner team members" },
  {
    key: "partnerUser.createAdmin",
    description: "Create partner administrators",
  },
  {
    key: "partnerUser.createEmployee",
    description: "Create partner employees",
  },
  { key: "partnerUser.update", description: "Edit partner team members" },
  {
    key: "partnerUser.status",
    description: "Activate or deactivate partner team members",
  },
  { key: "vendor.create", description: "Create new vendors" },
  { key: "vendor.read", description: "View vendors" },
  { key: "vendor.update", description: "Edit vendor details" },
  { key: "vendor.delete", description: "Delete vendors" },
  { key: "vendor.approve", description: "Approve vendors under review" },
  { key: "vendor.reject", description: "Reject vendors under review" },
  { key: "vendor.suspend", description: "Suspend published vendors" },
  { key: "vendor.publish", description: "Publish approved vendors" },
  { key: "vendorAccount.create", description: "Create vendor login accounts" },

  { key: "vendorCategory.create", description: "Create vendor categories" },
  { key: "vendorCategory.read", description: "View vendor categories" },
  { key: "vendorCategory.update", description: "Edit vendor categories" },
  { key: "vendorCategory.delete", description: "Deactivate vendor categories" },

  {
    key: "verification.upload",
    description: "Upload vendor verification documents",
  },
  {
    key: "verification.review",
    description: "Approve/reject verification documents",
  },
  { key: "verification.read", description: "View verification documents" },

  { key: "facility.create", description: "Create facilities" },
  { key: "facility.read", description: "View facilities" },
  { key: "facility.update", description: "Edit facilities" },
  { key: "facility.delete", description: "Deactivate facilities" },

  { key: "user.read", description: "View users" },
  { key: "user.suspend", description: "Suspend users" },
  { key: "user.activate", description: "Reactivate suspended users" },

  { key: "auditLog.read", description: "View audit logs" },
  { key: "dashboard.read", description: "View the admin dashboard" },

  { key: "role.read", description: "View roles" },
  { key: "role.assign", description: "Assign roles to users" },

  { key: "review.read", description: "View reviews" },
  { key: "review.hide", description: "Hide reviews" },
  { key: "review.delete", description: "Delete reviews" },
  { key: "review.restore", description: "Restore hidden/deleted reviews" },

  { key: "customer.read", description: "View customer profiles" },
  { key: "subscription.read", description: "View customer subscriptions" },
  { key: "subscription.cancel", description: "Cancel a customer subscription" },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const ROLE_PERMISSIONS: Record<string, PermissionKey[] | "*"> = {
  SUPER_ADMIN: "*",
  ADMIN: PERMISSIONS.map((p) => p.key).filter(
    (key) =>
      ![
        "role.assign",
        "partner.create",
        "partner.status",
        "partnerUser.createAdmin",
        "partnerUser.createEmployee",
        "partnerUser.update",
        "partnerUser.status",
        "vendorAccount.create",
        "vendor.approve",
        "vendor.reject",
        "vendor.publish",
        "vendor.suspend",
        "verification.review",
      ].includes(key),
  ) as PermissionKey[],
  VENDOR_MANAGER: [
    "vendor.create",
    "vendor.read",
    "vendor.update",
    "vendor.delete",
    "vendorCategory.read",
    "verification.upload",
    "verification.read",
    "facility.read",
    "dashboard.read",
    "subscription.read",
  ],
  PARTNER_ADMIN: [
    "partner.read",
    "partner.update",
    "partnerUser.read",
    "partnerUser.createAdmin",
    "partnerUser.createEmployee",
    "partnerUser.update",
    "partnerUser.status",
    "vendor.create",
    "vendor.read",
    "vendor.update",
    "vendor.delete",
    "vendorCategory.read",
    "verification.upload",
    "verification.read",
    "facility.read",
    "review.read",
    "review.hide",
    "review.delete",
    "review.restore",
    "subscription.read",
    "subscription.cancel",
  ],
  PARTNER_EMPLOYEE: [
    "partner.read",
    "vendor.read",
    "vendor.update",
    "vendorCategory.read",
    "verification.upload",
    "verification.read",
    "facility.read",
    "subscription.read",
  ],
  SUPPORT: [
    "user.read",
    "user.suspend",
    "user.activate",
    "dashboard.read",
    "customer.read",
    "subscription.read",
  ],
  CONTENT_MODERATOR: [
    "review.read",
    "review.hide",
    "review.delete",
    "review.restore",
    "dashboard.read",
  ],
  USER: [],
};

// Coarse, page-level guard used by middleware. Fine-grained per-action checks
// happen in Server Actions via requirePermission().
export const ROUTE_PERMISSIONS: Record<string, PermissionKey> = {
  "/partners": "partner.read",
  "/dashboard": "dashboard.read",
  "/users": "user.read",
  "/vendor-categories": "vendorCategory.read",
  "/vendors": "vendor.read",
  "/facilities": "facility.read",
  "/reviews": "review.read",
  "/audit-logs": "auditLog.read",
  "/customers": "customer.read",
  "/subscriptions": "subscription.read",
};
