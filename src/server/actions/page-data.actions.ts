"use server";

import { prisma } from "@/lib/prisma";
import {
  getCurrentSession,
  requirePartnerAccess,
  requireSuperAdmin,
  requireVendorAccess,
} from "@/lib/rbac";
import { assertCheckoutToken } from "@/lib/payments";
import { paymentConfig } from "@/lib/razorpay";

async function local_getRegistrationServices() {
  return prisma.vendorCategory.findMany({
    where: { status: "ACTIVE" },
    select: { slug: true, name: true },
    orderBy: { sortOrder: "asc" },
  });
}
async function local_getAccountOrganization() {
  const session = await getCurrentSession();
  if (!session?.user) return null;
  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: { partner: { select: { name: true } } },
  });
}
async function local_getPartnerServices(id: string) {
  await requirePartnerAccess(id, "partner.read");
  return prisma.vendor.findMany({
    where: { partnerId: id },
    select: { category: { select: { name: true } } },
    distinct: ["categoryId"],
  });
}
async function local_getPartnerDetails(id: string) {
  await requirePartnerAccess(id, "partner.read");
  return prisma.partner.findUnique({ where: { id } });
}
async function local_getVendorFacilities(id: string) {
  await requireVendorAccess(id, "vendor.read");
  return prisma.vendorFacility.findMany({ where: { vendorId: id } });
}
async function local_getVendorPhotos(id: string) {
  await requireVendorAccess(id, "vendor.read");
  return prisma.vendorMedia.findMany({
    where: { vendorId: id },
    orderBy: { sortOrder: "asc" },
  });
}
async function local_getMarketingPageData() {
  await requireSuperAdmin();
  return Promise.all([
    prisma.marketingCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.$queryRaw<
      { id: string; name: string }[]
    >`SELECT id,name FROM public.published_listings ORDER BY name`,
    prisma.vendorCategory.findMany({
      select: { slug: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
}
async function local_getPromotionsPageData() {
  await requireSuperAdmin();
  return Promise.all([
    prisma.promotionalBanner.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.$queryRaw<
      { id: string; name: string }[]
    >`SELECT id,name FROM public.published_listings ORDER BY name`,
  ]);
}
async function local_getHostedCheckout(id: string, token: string) {
  const order = await prisma.paymentOrder.findUnique({ where: { id } });
  if (!order) return null;
  try {
    assertCheckoutToken(order, token);
  } catch {
    return { expired: true as const };
  }
  return {
    expired: false as const,
    status: order.status,
    gatewayOrderId: order.gatewayOrderId,
    amountPaise: order.amountPaise,
    keyId:
      order.status === "CREATED" && order.gatewayOrderId
        ? paymentConfig().keyId
        : "",
  };
}

export async function getRegistrationServices(
  ...args: Parameters<typeof local_getRegistrationServices>
): Promise<Awaited<ReturnType<typeof local_getRegistrationServices>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_getRegistrationServices>>
    >("page-data.actions.getRegistrationServices", args);
  }
  return local_getRegistrationServices(...args);
}

export async function getAccountOrganization(
  ...args: Parameters<typeof local_getAccountOrganization>
): Promise<Awaited<ReturnType<typeof local_getAccountOrganization>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_getAccountOrganization>>
    >("page-data.actions.getAccountOrganization", args);
  }
  return local_getAccountOrganization(...args);
}

export async function getPartnerServices(
  ...args: Parameters<typeof local_getPartnerServices>
): Promise<Awaited<ReturnType<typeof local_getPartnerServices>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getPartnerServices>>>(
      "page-data.actions.getPartnerServices",
      args,
    );
  }
  return local_getPartnerServices(...args);
}

export async function getPartnerDetails(
  ...args: Parameters<typeof local_getPartnerDetails>
): Promise<Awaited<ReturnType<typeof local_getPartnerDetails>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getPartnerDetails>>>(
      "page-data.actions.getPartnerDetails",
      args,
    );
  }
  return local_getPartnerDetails(...args);
}

export async function getVendorFacilities(
  ...args: Parameters<typeof local_getVendorFacilities>
): Promise<Awaited<ReturnType<typeof local_getVendorFacilities>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getVendorFacilities>>>(
      "page-data.actions.getVendorFacilities",
      args,
    );
  }
  return local_getVendorFacilities(...args);
}

export async function getVendorPhotos(
  ...args: Parameters<typeof local_getVendorPhotos>
): Promise<Awaited<ReturnType<typeof local_getVendorPhotos>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getVendorPhotos>>>(
      "page-data.actions.getVendorPhotos",
      args,
    );
  }
  return local_getVendorPhotos(...args);
}

export async function getMarketingPageData(
  ...args: Parameters<typeof local_getMarketingPageData>
): Promise<Awaited<ReturnType<typeof local_getMarketingPageData>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getMarketingPageData>>>(
      "page-data.actions.getMarketingPageData",
      args,
    );
  }
  return local_getMarketingPageData(...args);
}

export async function getPromotionsPageData(
  ...args: Parameters<typeof local_getPromotionsPageData>
): Promise<Awaited<ReturnType<typeof local_getPromotionsPageData>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getPromotionsPageData>>>(
      "page-data.actions.getPromotionsPageData",
      args,
    );
  }
  return local_getPromotionsPageData(...args);
}

export async function getHostedCheckout(
  ...args: Parameters<typeof local_getHostedCheckout>
): Promise<Awaited<ReturnType<typeof local_getHostedCheckout>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getHostedCheckout>>>(
      "page-data.actions.getHostedCheckout",
      args,
    );
  }
  return local_getHostedCheckout(...args);
}

async function local_getPartnerHistory(partnerId: string, page: number) {
  await requirePartnerAccess(partnerId, "auditLog.read");
  const { pageWindow } = await import("@/lib/pagination");
  const window = pageWindow(page);
  const where = { partnerId };
  const [rows, count] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: window.skip,
      take: window.take,
      include: { user: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { rows, count, window };
}
async function local_getAdminPaymentSettings() {
  await requireSuperAdmin();
  const { getPaymentSettings } = await import("@/lib/payment-settings");
  return getPaymentSettings();
}
async function local_getVendorProposalLabels(id: string) {
  await requireVendorAccess(id, "vendor.read");
  const { proposalLabels } = await import("@/lib/listing-editor");
  return proposalLabels(id);
}

export async function getPartnerHistory(
  ...args: Parameters<typeof local_getPartnerHistory>
): Promise<Awaited<ReturnType<typeof local_getPartnerHistory>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_getPartnerHistory>>>(
      "page-data.actions.getPartnerHistory",
      args,
    );
  }
  return local_getPartnerHistory(...args);
}

export async function getAdminPaymentSettings(
  ...args: Parameters<typeof local_getAdminPaymentSettings>
): Promise<Awaited<ReturnType<typeof local_getAdminPaymentSettings>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_getAdminPaymentSettings>>
    >("page-data.actions.getAdminPaymentSettings", args);
  }
  return local_getAdminPaymentSettings(...args);
}

export async function getVendorProposalLabels(
  ...args: Parameters<typeof local_getVendorProposalLabels>
): Promise<Awaited<ReturnType<typeof local_getVendorProposalLabels>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_getVendorProposalLabels>>
    >("page-data.actions.getVendorProposalLabels", args);
  }
  return local_getVendorProposalLabels(...args);
}
