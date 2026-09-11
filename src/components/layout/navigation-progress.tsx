"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUrl = `${pathname}?${searchParams.toString()}`;
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loading = sourceUrl === currentUrl;

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target || anchor.download) return;

      const destination = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (
        destination.origin !== current.origin ||
        (destination.pathname === current.pathname &&
          destination.search === current.search)
      ) {
        return;
      }

      setSourceUrl(`${current.pathname}?${current.searchParams.toString()}`);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setSourceUrl(null), 10000);
    }

    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("click", handleClick, true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
      role="progressbar"
      aria-label="Loading page"
      aria-hidden={!loading}
    >
      {loading && <div className="navigation-progress-bar h-full bg-primary" />}
    </div>
  );
}
