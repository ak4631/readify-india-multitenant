"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/rbac";
import { PublicActionError } from "@/lib/public-action-error";
import { uploadVendorPhoto, deleteVendorPhoto } from "@/lib/imagekit";
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/upload-limits";
import { writeAuditLog } from "@/lib/audit";
import { deliverCustomerPushes } from "@/lib/push-delivery";

const text = z
  .string()
  .trim()
  .max(100)
  .transform((v) => v || null);
const audienceSchema = z
  .object({
    targetCity: text.prefault(""),
    targetArea: text.prefault(""),
    targetService: text.prefault(""),
  })
  .refine(
    (v) => !v.targetArea || !!v.targetCity,
    "Area targeting requires a city",
  );

async function local_previewMarketingAudience(form: FormData) {
  await requireSuperAdmin();
  const parsed = audienceSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    throw new PublicActionError(
      parsed.error.issues.map((i) => i.message).join(". "),
    );
  const { targetCity, targetArea, targetService } = parsed.data;
  const rows = await prisma.$queryRaw<
    { recipients: number; pushUsers: number }[]
  >`SELECT count(*)::int AS recipients, count(*) FILTER(WHERE EXISTS(SELECT 1 FROM admin.customer_push_tokens t WHERE t.user_id=a.user_id))::int AS "pushUsers" FROM admin.marketing_audience(${targetCity},${targetArea},${targetService}) a`;
  return rows[0] ?? { recipients: 0, pushUsers: 0 };
}

const schema = z
  .object({
    title: z.string().trim().min(3).max(150),
    body: z.string().trim().min(3).max(1000),
    vendorId: text.prefault(""),
    serviceCategory: z
      .union([
        z.literal(""),
        z.enum(["library", "gym", "co_working_space", "exam_hub"]),
      ])
      .default("")
      .transform((v) => v || null),
    destinationUrl: z
      .string()
      .trim()
      .max(2000)
      .default("")
      .transform((v) => v || null),
    targetCity: text.prefault(""),
    targetArea: text.prefault(""),
    targetService: text.prefault(""),
    scheduledAt: z.coerce.date(),
  })
  .refine(
    (v) =>
      [v.vendorId, v.serviceCategory, v.destinationUrl].filter(Boolean)
        .length <= 1,
    "Choose at most one listing, service or HTTPS offer link",
  )
  .refine(
    (v) => !v.targetArea || !!v.targetCity,
    "Area targeting requires a city",
  )
  .refine((v) => {
    if (!v.destinationUrl) return true;
    try {
      const url = new URL(v.destinationUrl);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use a valid HTTPS offer link");

async function local_createMarketingCampaign(form: FormData) {
  const session = await requireSuperAdmin();
  const mode = form.get("mode");
  if (mode !== "now" && mode !== "schedule")
    throw new PublicActionError("Choose send now or schedule");
  const parsed = schema.safeParse({
    ...Object.fromEntries(form),
    scheduledAt: mode === "now" ? new Date() : form.get("scheduledAt"),
  });
  if (!parsed.success)
    throw new PublicActionError(
      parsed.error.issues.map((i) => i.message).join(". "),
    );
  const data = parsed.data;
  if (mode === "schedule" && data.scheduledAt <= new Date())
    throw new PublicActionError("Choose a future delivery time");
  for (const category of [data.serviceCategory, data.targetService].filter(
    Boolean,
  )) {
    const found = await prisma.vendorCategory.findFirst({
      where: { slug: category!.replaceAll("_", "-") },
      select: { id: true },
    });
    if (!found) throw new PublicActionError("Choose an available service");
  }
  if (data.vendorId) {
    const listing = await prisma.$queryRaw<
      { id: string }[]
    >`SELECT id FROM public.published_listings WHERE id=${data.vendorId}`;
    if (!listing.length)
      throw new PublicActionError("Choose a published, available listing");
  }
  const file = form.get("file");
  let uploaded: { url: string; fileId: string } | null = null;
  if (file instanceof File && file.size) {
    if (
      file.size > MAX_UPLOAD_SIZE_BYTES ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      throw new PublicActionError("Upload a JPG, PNG or WEBP image up to 4 MB");
    uploaded = await uploadVendorPhoto("marketing", file);
  }
  let result: {
    id: string;
    recipientCount: number;
    status: "QUEUED" | "SCHEDULED";
  };
  try {
    result = await prisma.$transaction(async (tx) => {
      const campaign = await tx.marketingCampaign.create({
        data: {
          ...data,
          imageUrl: uploaded?.url ?? null,
          createdBy: session.user.id,
        },
      });
      let recipientCount = 0;
      if (mode === "now") {
        const rows = await tx.$queryRaw<
          { count: number }[]
        >`SELECT admin.enqueue_marketing_campaign(${campaign.id}) AS count`;
        recipientCount = rows[0]?.count ?? 0;
        if (!recipientCount)
          throw new PublicActionError(
            "No active users match this audience. Clear the filters to notify all active users.",
          );
      }
      await writeAuditLog(tx, {
        userId: session.user.id,
        action: "CREATE_MARKETING_CAMPAIGN",
        entityType: "marketing_campaign",
        entityId: campaign.id,
        newValue: {
          ...campaign,
          recipientCount,
          status: mode === "now" ? "QUEUED" : "SCHEDULED",
        },
      });
      return {
        id: campaign.id,
        recipientCount,
        status: mode === "now" ? ("QUEUED" as const) : ("SCHEDULED" as const),
      };
    });
  } catch (error) {
    if (uploaded) await deleteVendorPhoto(uploaded.fileId).catch(() => {});
    throw error;
  }
  // Inbox creation has committed. A push-provider failure must not turn a successful
  // broadcast into a failed form submission and invite the sender to duplicate it.
  let pushStatus: "pending" | "attempted" | "unavailable" | "scheduled" =
    "scheduled";
  if (mode === "now") {
    try {
      const push = await deliverCustomerPushes(result.id);
      pushStatus = !push.configured
        ? "unavailable"
        : push.failed
          ? "pending"
          : "attempted";
    } catch {
      pushStatus = "pending";
    }
  }
  revalidatePath("/marketing");
  return { ...result, pushStatus };
}

async function local_cancelMarketingCampaign(id: string) {
  const session = await requireSuperAdmin();
  await prisma.$transaction(async (tx) => {
    const result = await tx.marketingCampaign.updateMany({
      where: { id, status: "SCHEDULED" },
      data: { status: "CANCELLED" },
    });
    if (!result.count)
      throw new PublicActionError("Only scheduled campaigns can be cancelled");
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "CANCEL_MARKETING_CAMPAIGN",
      entityType: "marketing_campaign",
      entityId: id,
    });
  });
  revalidatePath("/marketing");
}

export async function previewMarketingAudience(
  ...args: Parameters<typeof local_previewMarketingAudience>
): Promise<Awaited<ReturnType<typeof local_previewMarketingAudience>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_previewMarketingAudience>>
    >("marketing.actions.previewMarketingAudience", args);
  }
  return local_previewMarketingAudience(...args);
}

export async function createMarketingCampaign(
  ...args: Parameters<typeof local_createMarketingCampaign>
): Promise<Awaited<ReturnType<typeof local_createMarketingCampaign>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_createMarketingCampaign>>
    >("marketing.actions.createMarketingCampaign", args);
  }
  return local_createMarketingCampaign(...args);
}

export async function cancelMarketingCampaign(
  ...args: Parameters<typeof local_cancelMarketingCampaign>
): Promise<Awaited<ReturnType<typeof local_cancelMarketingCampaign>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_cancelMarketingCampaign>>
    >("marketing.actions.cancelMarketingCampaign", args);
  }
  return local_cancelMarketingCampaign(...args);
}
