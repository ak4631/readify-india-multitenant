"use client";
import { RequestErrorPanel } from "@/components/request-error-panel";
import "./globals.css";
export default function GlobalError(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="mx-auto max-w-3xl p-6">
          <RequestErrorPanel {...props} />
        </main>
      </body>
    </html>
  );
}
