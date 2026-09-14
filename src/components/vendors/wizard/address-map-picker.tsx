"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` at import time, so this must never be
// server-rendered.
export const AddressMapPicker = dynamic(
  () => import("./address-map-picker-impl").then((m) => m.AddressMapPickerImpl),
  {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse rounded-lg bg-muted" />,
  },
);

export type { AddressMapPickerProps } from "./address-map-picker-impl";
