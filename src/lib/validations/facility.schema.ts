import { z } from "zod";

export const facilitySchema = z.object({
  name: z.string().min(2, "Name is required"),
  category: z.string().optional(),
  icon: z.string().optional(),
});

export type FacilityInput = z.infer<typeof facilitySchema>;

export const vendorFacilitiesSchema = z.object({
  vendorId: z.string().trim().min(1).max(128),
  facilityIds: z
    .array(z.string().trim().min(1).max(128))
    .max(200)
    .transform((ids) => [...new Set(ids)]),
});
