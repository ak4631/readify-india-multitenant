"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  getDashboardMetrics,
  type DashboardMetrics,
} from "@/server/actions/dashboard.actions";

export function useDashboardMetrics(initialData: DashboardMetrics) {
  const { data: session } = useSession();
  return useQuery({
    queryKey: [
      "dashboard-metrics",
      session?.user?.id,
      session?.user?.roles.join(","),
      session?.user?.permissions.join(","),
    ],
    queryFn: () => getDashboardMetrics(),
    initialData,
    refetchInterval: 30_000,
  });
}
