"use client";

import { useQuery } from "@tanstack/react-query";
import { getDashboardMetrics, type DashboardMetrics } from "@/server/actions/dashboard.actions";

export function useDashboardMetrics(initialData: DashboardMetrics) {
  return useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: () => getDashboardMetrics(),
    initialData,
    refetchInterval: 30_000,
  });
}
