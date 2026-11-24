"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/rbac";
import { PublicActionError } from "@/lib/public-action-error";
import { uploadVendorPhoto, deleteVendorPhoto } from "@/lib/imagekit";
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/upload-limits";
import { writeAuditLog } from "@/lib/audit";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);
const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" ? null : Number(v)),
    z.number().min(min).max(max).nullable(),
  );
const schema = z
  .object({
    title: z.string().trim().min(3).max(150),
    vendorId: optionalText(100),
    destinationUrl: z
      .string()
      .trim()
      .max(2000)
      .refine(
        (v) =>
          !v ||
          (() => {
            try {
              const u = new URL(v);
              return u.protocol === "https:" && !u.username && !u.password;
            } catch {
              return false;
            }
          })(),
        "Use a valid HTTPS link",
      )
      .transform((v) => v || null),
    targetCity: optionalText(100),
    targetArea: optionalText(100),
    latitude: optionalNumber(-90, 90),
    longitude: optionalNumber(-180, 180),
    radiusKm: optionalNumber(0.1, 500),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    sortOrder: z.coerce.number().int().min(0).max(10000),
    isActive: z.boolean(),
  })
  .refine(
    (v) => !!v.vendorId !== !!v.destinationUrl,
    "Choose either a listing or an HTTPS link",
  )
  .refine(
    (v) => !v.targetArea || !!v.targetCity,
    "Area targeting requires a city",
  )
  .refine(
    (v) =>
      [v.latitude, v.longitude, v.radiusKm].every((x) => x === null) ||
      [v.latitude, v.longitude, v.radiusKm].every((x) => x !== null),
    "Provide latitude, longitude and radius together",
  )
  .refine((v) => v.endsAt > v.startsAt, "End must be after start");

async function local_savePromotionalBanner(form: FormData) {
  const session = await requireSuperAdmin();
  const parsed = schema.safeParse({
    ...Object.fromEntries(form),
    isActive: form.get("isActive") === "on",
  });
  if (!parsed.success)
    throw new PublicActionError(
      parsed.error.issues.map((x) => x.message).join(". "),
    );
  const data = parsed.data;
  const id = z
    .string()
    .max(100)
    .parse(form.get("id") ?? "");
  const previous = id
    ? await prisma.promotionalBanner.findUnique({ where: { id } })
    : null;
  if (id && !previous) throw new PublicActionError("Banner not found");
  if (data.vendorId) {
    const listing = await prisma.$queryRaw<
      { id: string }[]
    >`SELECT id FROM public.published_listings WHERE id=${data.vendorId}`;
    if (!listing.length)
      throw new PublicActionError("Choose a published, available listing");
  }
  const file = form.get("file");
  let uploaded: { url: string; fileId: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (
      file.size > MAX_UPLOAD_SIZE_BYTES ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    )
      throw new PublicActionError("Upload a JPG, PNG or WEBP image up to 4 MB");
    uploaded = await uploadVendorPhoto("promotions", file);
  }
  if (!uploaded && !previous)
    throw new PublicActionError("Upload a banner image");
  try {
    await prisma.$transaction(async (tx) => {
      const values = {
        ...data,
        imageUrl: uploaded?.url ?? previous!.imageUrl,
        externalId: uploaded?.fileId ?? previous!.externalId,
      };
      const banner = previous
        ? await tx.promotionalBanner.update({ where: { id }, data: values })
        : await tx.promotionalBanner.create({ data: values });
      await writeAuditLog(tx, {
        userId: session.user.id,
        action: "SAVE_PROMOTIONAL_BANNER",
        entityType: "promotional_banner",
        entityId: banner.id,
        newValue: banner,
      });
    });
  } catch (error) {
    if (uploaded) await deleteVendorPhoto(uploaded.fileId).catch(() => {});
    throw error;
  }
  // Existing image URLs can still be displayed on clients until their next refresh.
  revalidatePath("/promotions");
}
async function local_deactivatePromotionalBanner(id: string) {
  const session = await requireSuperAdmin();
  await prisma.$transaction(async (tx) => {
    await tx.promotionalBanner.update({
      where: { id },
      data: { isActive: false },
    });
    await writeAuditLog(tx, {
      userId: session.user.id,
      action: "DEACTIVATE_PROMOTIONAL_BANNER",
      entityType: "promotional_banner",
      entityId: id,
    });
  });
  revalidatePath("/promotions");
}

export async function savePromotionalBanner(
  ...args: Parameters<typeof local_savePromotionalBanner>
): Promise<Awaited<ReturnType<typeof local_savePromotionalBanner>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<Awaited<ReturnType<typeof local_savePromotionalBanner>>>(
      "promotions.actions.savePromotionalBanner",
      args,
    );
  }
  return local_savePromotionalBanner(...args);
}

export async function deactivatePromotionalBanner(
  ...args: Parameters<typeof local_deactivatePromotionalBanner>
): Promise<Awaited<ReturnType<typeof local_deactivatePromotionalBanner>>> {
  if (process.env.BACKEND_URL) {
    const { callBackend } = await import("@/lib/backend-client");
    return callBackend<
      Awaited<ReturnType<typeof local_deactivatePromotionalBanner>>
    >("promotions.actions.deactivatePromotionalBanner", args);
  }
  return local_deactivatePromotionalBanner(...args);
}
