"use server";

import { pageWindow, toPage, type Page } from "@/lib/pagination";
import { getSessionPartnerId, requirePermission } from "@/lib/rbac";
import { listCustomerProfiles } from "@/lib/profiles";

import { listPartnerCustomerPage } from "@/lib/partner-customers";

// One row shape for both the platform-staff view (all app users, with their
// account role/status) and the partner-scoped view (only customers who have
// booked/subscribed with THIS partner's listings, with booking/spend stats
// instead) -- CustomerTable picks which columns to show via `scope`.
export type CustomerRow = {
  id: string;
  fullName: string | null;
  email: string | null;
  // Platform scope only:
  role: string | null;
  isActive: boolean | null;
  // Partner scope only:
  totalBookings: number | null;
  activeSubscriptions: number | null;
  totalSpent: number | null;
  lastActivityAt: Date | null;
  // Platform scope: account creation date. Partner scope: first booking/
  // subscription with this partner.
  joinedAt: Date;
  flexibleBookings?: number;
  present?: boolean;
};

export type CustomersResult = {
  asOf: Date;
  scope: "platform" | "partner";
  customers: Page<CustomerRow>;
};

export type CustomerType = "all" | "new" | "active" | "permanent" | "flexible";

async function local_listCustomers(
  options: { partnerId?: string; page?: number; type?: CustomerType } = {},
): Promise<CustomersResult> {
  const session = await requirePermission("customer.read");
  const partnerId = await getSessionPartnerId(session, options.partnerId);
  const window = pageWindow(options.page ?? 1);
  const asOf = new Date();

  if (!partnerId) {
    const profiles = await listCustomerProfiles(window);
    return {
      asOf,
      scope: "platform",
      customers: toPage(
        profiles.items.map((p) => ({
          id: p.id,
          fullName: p.fullName,
          email: p.email,
          role: p.role,
          isActive: p.isActive,
          totalBookings: null,
          activeSubscriptions: null,
          totalSpent: null,
          lastActivityAt: null,
          joinedAt: p.createdAt,
        })),
        profiles.total,
        window,
      ),
    };
  }

  return {
    asOf,
    scope: "partner",
    customers: await listPartnerCustomerPage(
      partnerId,
      options.type ?? "all",
      asOf,
      window,
    ),
  };
}

export async function listCustomers(
  ...args: Parameters<typeof local_listCustomers>
): Promise<Awaited<ReturnType<typeof local_listCustomers>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_listCustomers>>>(
      "customers.actions.listCustomers",
      args,
    );
  }
  return local_listCustomers(...args);
}
