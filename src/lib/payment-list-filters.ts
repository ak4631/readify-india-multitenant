import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export type PaymentListFilters = {
  q?: string;
  vendorId?: string;
  status?: string;
  date?: string;
};

export async function paymentListFilters(
  filters: PaymentListFilters,
): Promise<Prisma.PaymentOrderWhereInput[]> {
  const q = filters.q?.trim();
  const vendors = q
    ? await prisma.vendor.findMany({
        where: { name: { contains: q, mode: "insensitive" } },
        select: { id: true },
      })
    : [];
  return [
    ...(filters.vendorId ? [{ vendorId: filters.vendorId }] : []),
    ...(filters.status && !["all", "pending"].includes(filters.status)
      ? [{ status: filters.status }]
      : []),
    ...(filters.date
      ? [
          {
            createdAt: {
              gte: new Date(`${filters.date}T00:00:00+05:30`),
              lt: new Date(
                new Date(`${filters.date}T00:00:00+05:30`).getTime() + 86400000,
              ),
            },
          },
        ]
      : []),
    ...(q
      ? [
          {
            OR: [
              { id: { contains: q, mode: "insensitive" as const } },
              { targetId: { contains: q, mode: "insensitive" as const } },
              { vendorId: { in: vendors.map((v) => v.id) } },
            ],
          },
        ]
      : []),
  ];
}
