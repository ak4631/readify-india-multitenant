"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { Suspense, useState } from "react";
import { NavigationProgress } from "@/components/layout/navigation-progress";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
        <Toaster />
      </QueryClientProvider>
    </SessionProvider>
  );
}
