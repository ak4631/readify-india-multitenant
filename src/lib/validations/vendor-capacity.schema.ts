import { z } from "zod";

export const vendorCapacitySchema = z.object({
  // Null clears the override, falling back to the hardcoded default (20).
  capacity: z
    .number()
    .int()
    .positive("Capacity must be greater than 0")
    .max(9999, "Keep capacity under 10,000")
    .nullable(),
});

export type VendorCapacityInput = z.infer<typeof vendorCapacitySchema>;
