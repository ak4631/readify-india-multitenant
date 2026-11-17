"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/rbac";
import { PublicActionError } from "@/lib/public-action-error";
import { uploadVendorPhoto, deleteVendorPhoto } from "@/lib/imagekit";
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/upload-limits";
import { writeAuditLog } from "@/lib/audit";

const text = z
  .string()
  .trim()
  .max(100)
  .transform((v) => v || null);
const schema = z
  .object({
    title: z.string().trim().min(3).max(150),
    body: z.string().trim().min(3).max(1000),
    vendorId: text,
    serviceCategory: z
      .union([
        z.literal(""),
        z.enum(["library", "gym", "co_working_space", "exam_hub"]),
      ])
      .transform((v) => v || null),
    destinationUrl: z
      .string()
      .trim()
      .max(2000)
      .transform((v) => v || null),
    targetCity: text,
    targetArea: text,
    targetService: text,
    scheduledAt: z.coerce.date(),
  })
  .refine(
    (v) =>
      [v.vendorId, v.serviceCategory, v.destinationUrl].filter(Boolean)
        .length === 1,
    "Choose exactly one listing, service or HTTPS offer link",
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

export async function createMarketingCampaign(form: FormData) {
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
  try {
    await prisma.$transaction(async (tx) => {
      const campaign = await tx.marketingCampaign.create({
        data: {
          ...data,
          imageUrl: uploaded?.url ?? null,
          createdBy: session.user.id,
        },
      });
      await writeAuditLog(tx, {
        userId: session.user.id,
        action: "CREATE_MARKETING_CAMPAIGN",
        entityType: "marketing_campaign",
        entityId: campaign.id,
        newValue: campaign,
      });
    });
  } catch (error) {
    if (uploaded) await deleteVendorPhoto(uploaded.fileId).catch(() => {});
    throw error;
  }
  revalidatePath("/marketing");
}

export async function cancelMarketingCampaign(id: string) {
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
