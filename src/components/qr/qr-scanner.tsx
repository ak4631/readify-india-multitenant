"use client";
import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startQrCamera } from "@/lib/qr-camera";
export function QrScanner({
  onScan,
  disabled = false,
}: {
  onScan: (value: string) => void;
  disabled?: boolean;
}) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null);
  const callback = useRef(onScan);
  useEffect(() => {
    callback.current = onScan;
  }, [onScan]);
  useEffect(() => {
    if (!active || disabled || !video.current) return;
    const stop = startQrCamera(
      video.current,
      (value) => {
        setActive(false);
        callback.current(value);
      },
      (message) => {
        setActive(false);
        setError(message);
      },
    );
    const hide = () => {
      if (document.visibilityState === "hidden") {
        stop();
        setActive(false);
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", hide);
    };
  }, [active, disabled]);
  return (
    <div className="space-y-2">
      {!active ? (
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => {
            setError("");
            setActive(true);
          }}
        >
          <ScanLine aria-hidden="true" />
          Scan QR
        </Button>
      ) : (
        <div
          role="region"
          aria-label="Booking QR scanner"
          className="space-y-3 rounded-lg border p-3"
        >
          <p className="text-sm">
            Point the camera at the customer&apos;s booking QR.
          </p>
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            aria-label="QR camera preview"
            className="aspect-square w-full max-w-sm rounded-lg bg-black object-cover"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setActive(false)}
          >
            Stop camera
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
