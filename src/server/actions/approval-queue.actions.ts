"use server";
import { prisma } from "@/lib/prisma";
import { getSessionPartnerId, requirePermission } from "@/lib/rbac";
import { pageWindow, toPage } from "@/lib/pagination";

export type ApprovalKind =
  | "applications"
  | "listings"
  | "changes"
  | "documents"
  | "issues"
  | "support"
  | "refunds";
export type QueueRow = {
  id: string;
  title: string;
  detail: string;
  status: string;
  href: string;
  createdAt: Date;
};
export async function listApprovalQueue(
  options: { partnerId?: string; kind?: string; page?: number } = {},
) {
  const session = await requirePermission("vendor.read");
  const partnerId = await getSessionPartnerId(session, options.partnerId);
  const scope = partnerId ? { partnerId } : {};
  const window = pageWindow(options.page ?? 1);
  const kind: ApprovalKind = [
    "applications",
    "listings",
    "changes",
    "documents",
    "issues",
    "support",
    "refunds",
  ].includes(options.kind ?? "")
    ? (options.kind as ApprovalKind)
    : "listings";
  let items: QueueRow[];
  let total: number;
  if (kind === "applications") {
    const where = {
      ...(partnerId ? { id: partnerId } : {}),
      approvalStatus: "PENDING",
    };
    const [rows, count] = await Promise.all([
      prisma.partner.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: window.skip,
        take: window.take,
      }),
      prisma.partner.count({ where }),
    ]);
    items = rows.map((r) => ({
      id: r.id,
      title: r.name,
      detail: "Partner application",
      status: r.approvalStatus,
      href: `/partners/${r.id}`,
      createdAt: r.createdAt,
    }));
    total = count;
  } else if (kind === "listings" || kind === "issues") {
    const where = {
      ...scope,
      status: {
        in:
          kind === "issues"
            ? (["REJECTED", "SUSPENDED"] as const)
            : (["SUBMITTED", "UNDER_REVIEW", "APPROVED"] as const),
      },
    };
    const filter = { ...where, status: { in: [...where.status.in] } };
    const [rows, count] = await Promise.all([
      prisma.vendor.findMany({
        where: filter,
        include: { partner: { select: { name: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: window.skip,
        take: window.take,
      }),
      prisma.vendor.count({ where: filter }),
    ]);
    items = rows.map((r) => ({
      id: r.id,
      title: r.name,
      detail:
        r.partner.name + (r.rejectionReason ? `: ${r.rejectionReason}` : ""),
      status: r.status,
      href: `/vendors/${r.id}?tab=review`,
      createdAt: r.createdAt,
    }));
    total = count;
  } else if (kind === "changes") {
    const vendorIds = partnerId
      ? (
          await prisma.vendor.findMany({
            where: { partnerId },
            select: { id: true },
          })
        ).map((r) => r.id)
      : null;
    const where = {
      ...(vendorIds ? { vendorId: { in: vendorIds } } : {}),
      status: "PENDING",
    };
    const [rows, count] = await Promise.all([
      prisma.listingRevision.findMany({
        where,
        orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
        skip: window.skip,
        take: window.take,
      }),
      prisma.listingRevision.count({ where }),
    ]);
    const vendors = await prisma.vendor.findMany({
      where: { id: { in: rows.map((r) => r.vendorId) } },
      include: { partner: { select: { name: true } } },
    });
    items = rows.map((r) => {
      const v = vendors.find((v) => v.id === r.vendorId);
      return {
        id: r.id,
        title: v?.name ?? "Listing revision",
        detail: v?.partner.name ?? "",
        status: r.status,
        href: `/vendors/${r.vendorId}?tab=changes`,
        createdAt: r.submittedAt ?? r.createdAt,
      };
    });
    total = count;
  } else if (kind === "documents") {
    const where = {
      status: "PENDING" as const,
      vendor: {
        ...scope,
        status: {
          in: ["SUBMITTED", "UNDER_REVIEW"] as ("SUBMITTED" | "UNDER_REVIEW")[],
        },
      },
    };
    const [rows, count] = await Promise.all([
      prisma.vendorVerification.findMany({
        where,
        include: { vendor: { select: { name: true } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: window.skip,
        take: window.take,
      }),
      prisma.vendorVerification.count({ where }),
    ]);
    items = rows.map((r) => ({
      id: r.id,
      title: r.vendor.name,
      detail: r.documentType.replaceAll("_", " "),
      status: r.status,
      href: `/vendors/${r.vendorId}?tab=verification`,
      createdAt: r.createdAt,
    }));
    total = count;
  } else if (kind === "support") {
    const where = { ...scope, status: "OPEN" };
    const [rows, count] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: window.skip,
        take: window.take,
      }),
      prisma.supportTicket.count({ where }),
    ]);
    items = rows.map((r) => ({
      id: r.id,
      title: r.subject,
      detail: "Support requires a response",
      status: r.status,
      href: r.partnerId ? `/partners/${r.partnerId}/support` : "/support",
      createdAt: r.createdAt,
    }));
    total = count;
  } else {
    const vendorIds = partnerId
      ? (
          await prisma.vendor.findMany({
            where: { partnerId },
            select: { id: true },
          })
        ).map((r) => r.id)
      : null;
    const where = {
      ...(vendorIds ? { vendorId: { in: vendorIds } } : {}),
      status: "REFUND_PENDING",
    };
    const [rows, count] = await Promise.all([
      prisma.paymentOrder.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: window.skip,
        take: window.take,
      }),
      prisma.paymentOrder.count({ where }),
    ]);
    const vendors = await prisma.vendor.findMany({
      where: { id: { in: rows.map((r) => r.vendorId) } },
      select: { id: true, name: true, partnerId: true },
    });
    items = rows.map((r) => {
      const v = vendors.find((v) => v.id === r.vendorId);
      return {
        id: r.id,
        title: v?.name ?? "Refund",
        detail: `₹${(r.amountPaise / 100).toFixed(2)} · ${r.id}`,
        status: r.status,
        href: v ? `/partners/${v.partnerId}/payments` : "/payments",
        createdAt: r.createdAt,
      };
    });
    total = count;
  }
  return { ...toPage(items, total, window), kind };
}
