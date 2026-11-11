"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ListingError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <section role="alert" className="space-y-4 rounded-lg border bg-card p-6">
      <h1 className="text-xl font-semibold">
        This listing could not be loaded
      </h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        If you just saved a change, it may already have been recorded. Retry
        loading the listing and check its current details and Changes tab before
        submitting the same change again.
      </p>
      {error.digest && (
        <p className="text-sm">
          Error reference: <code>{error.digest}</code>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={retry}>Retry loading</Button>
        <Link href="/vendors" className="text-sm text-primary underline">
          Back to listings
        </Link>
      </div>
    </section>
  );
}
