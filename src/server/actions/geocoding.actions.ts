"use server";

import { searchAddress, reverseGeocode } from "@/lib/geocoding";

// Stateless reads against a third-party API, not a mutation on tenant data --
// no requirePermission gate here (the actual write path, updateVendorAddress,
// stays gated by requireVendorAccess as before).
async function local_searchAddressAction(query: string) {
  return searchAddress(query);
}

async function local_reverseGeocodeAction(latitude: number, longitude: number) {
  return reverseGeocode(latitude, longitude);
}

export async function searchAddressAction(
  ...args: Parameters<typeof local_searchAddressAction>
): Promise<Awaited<ReturnType<typeof local_searchAddressAction>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_searchAddressAction>>>(
      "geocoding.actions.searchAddressAction",
      args,
    );
  }
  return local_searchAddressAction(...args);
}

export async function reverseGeocodeAction(
  ...args: Parameters<typeof local_reverseGeocodeAction>
): Promise<Awaited<ReturnType<typeof local_reverseGeocodeAction>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_reverseGeocodeAction>>>(
      "geocoding.actions.reverseGeocodeAction",
      args,
    );
  }
  return local_reverseGeocodeAction(...args);
}
