import { z } from "zod";

export const vendorCategorySchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().optional(),
  icon: z.string().optional(),
});

export type VendorCategoryInput = z.infer<typeof vendorCategorySchema>;
