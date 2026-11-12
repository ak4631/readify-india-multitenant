"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { getActionErrorMessage } from "@/lib/action-error-message";

export function RequestErrorPanel({
  error,
  retry,
  title = "This page could not be loaded",
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title?: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <section role="alert" className="space-y-4 rounded-lg border bg-card p-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="max-w-2xl text-sm text-muted-foreground">
        {getActionErrorMessage(
          error,
          "The server could not load this page. Please try again.",
        )}
      </p>
      <p className="max-w-2xl text-sm text-muted-foreground">
        If you just saved a change, check whether it was recorded before
        submitting it again.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Button
          disabled={pending}
          onClick={() => startTransition(() => retry())}
        >
          {pending ? "Retrying…" : "Try again"}
        </Button>
        <Link href="/dashboard" className="text-sm text-primary underline">
          Back to dashboard
        </Link>
      </div>
    </section>
  );
}
