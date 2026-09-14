"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, LocateFixed } from "lucide-react";
import {
  searchAddressAction,
  reverseGeocodeAction,
} from "@/server/actions/geocoding.actions";
import type { GeocodeResult } from "@/lib/geocoding";

// Leaflet's default marker icon references image files by relative URL,
// which breaks under most bundlers (webpack/Turbopack rewrite asset paths).
// An inline SVG divIcon sidesteps needing to ship marker-icon.png into
// public/ at all.
const pinIcon = L.divIcon({
  className: "",
  html: `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 0C7.163 0 0 7.163 0 16c0 11.5 16 26 16 26s16-14.5 16-26C32 7.163 24.837 0 16 0z" fill="#DC2626"/>
    <circle cx="16" cy="16" r="6" fill="white"/>
  </svg>`,
  iconSize: [32, 42],
  iconAnchor: [16, 42],
});

const DEFAULT_CENTER: [number, number] = [28.6139, 77.209]; // Delhi NCR

function RecenterOnChange({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(position, map.getZoom() < 12 ? 14 : map.getZoom());
    // Only react to position changes, not zoom -- re-running on every zoom
    // change would fight the user's own map interactions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position[0], position[1]]);
  return null;
}

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export type AddressMapPickerProps = {
  latitude?: number;
  longitude?: number;
  onChange: (lat: number, lng: number) => void;
  onAddressSelect?: (result: GeocodeResult) => void;
};

export function AddressMapPickerImpl({
  latitude,
  longitude,
  onChange,
  onAddressSelect,
}: AddressMapPickerProps) {
  const position: [number, number] =
    latitude != null && longitude != null ? [latitude, longitude] : DEFAULT_CENTER;
  const hasPin = latitude != null && longitude != null;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await searchAddressAction(value));
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function handleSelectResult(result: GeocodeResult) {
    onChange(result.latitude, result.longitude);
    onAddressSelect?.(result);
    setQuery(result.label);
    setResults([]);
  }

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        onChange(lat, lng);
        const result = await reverseGeocodeAction(lat, lng);
        if (result) {
          onAddressSelect?.(result);
          setQuery(result.label);
        }
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search for an address..."
          />
          {searching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
          {results.length > 0 && (
            <ul className="absolute z-[1000] mt-1 w-full rounded-md border border-border bg-popover shadow-md">
              {results.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => handleSelectResult(r)}
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleUseCurrentLocation}
          disabled={locating}
        >
          {locating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LocateFixed className="h-4 w-4" />
          )}
        </Button>
      </div>

      <div className="h-64 w-full overflow-hidden rounded-lg border border-border">
        <MapContainer
          center={position}
          zoom={hasPin ? 14 : 5}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {hasPin && <Marker position={position} icon={pinIcon} />}
          <RecenterOnChange position={position} />
          <ClickHandler onClick={onChange} />
        </MapContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        Search an address, click &ldquo;Use my current location&rdquo;, or click directly on the
        map to place the pin.
      </p>
    </div>
  );
}
