"use server";

import { requirePermission } from "@/lib/rbac";
import { listCustomerProfiles } from "@/lib/profiles";

export async function listCustomers() {
  await requirePermission("customer.read");
  return listCustomerProfiles();
}
