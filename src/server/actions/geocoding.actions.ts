"use server";

import { searchAddress, reverseGeocode } from "@/lib/geocoding";

// Stateless reads against a third-party API, not a mutation on tenant data --
// no requirePermission gate here (the actual write path, updateVendorAddress,
// stays gated by requireVendorAccess as before).
export async function searchAddressAction(query: string) {
  return searchAddress(query);
}

export async function reverseGeocodeAction(latitude: number, longitude: number) {
  return reverseGeocode(latitude, longitude);
}
