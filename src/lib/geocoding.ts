import "server-only";

const LOCATIONIQ_BASE_URL = "https://us1.locationiq.com/v1";

function getApiKey(): string {
  const key = process.env.LOCATIONIQ_API_KEY;
  if (!key) throw new Error("LOCATIONIQ_API_KEY must be set for geocoding.");
  return key;
}

export type GeocodeResult = {
  label: string;
  latitude: number;
  longitude: number;
  city?: string;
  state?: string;
  pincode?: string;
};

type LocationIqAddress = {
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  postcode?: string;
};

type LocationIqPlace = {
  display_name: string;
  lat: string;
  lon: string;
  address?: LocationIqAddress;
};

function toGeocodeResult(place: LocationIqPlace): GeocodeResult {
  return {
    label: place.display_name,
    latitude: Number(place.lat),
    longitude: Number(place.lon),
    city: place.address?.city ?? place.address?.town ?? place.address?.village,
    state: place.address?.state,
    pincode: place.address?.postcode,
  };
}

export async function searchAddress(query: string): Promise<GeocodeResult[]> {
  if (query.trim().length < 3) return [];

  const url = new URL(`${LOCATIONIQ_BASE_URL}/autocomplete`);
  url.searchParams.set("key", getApiKey());
  url.searchParams.set("q", query);
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("limit", "5");
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    if (res.status === 404) return []; // LocationIQ 404s on zero matches
    throw new Error(`LocationIQ autocomplete failed: ${res.status}`);
  }
  const data = (await res.json()) as LocationIqPlace[];
  return data.map(toGeocodeResult);
}

export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<GeocodeResult | null> {
  const url = new URL(`${LOCATIONIQ_BASE_URL}/reverse`);
  url.searchParams.set("key", getApiKey());
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as LocationIqPlace;
  if (!data.display_name) return null;
  return toGeocodeResult(data);
}
