import { z } from "zod";

export const facilitySchema = z.object({
  name: z.string().min(2, "Name is required"),
  category: z.string().optional(),
  icon: z.string().optional(),
});

export type FacilityInput = z.infer<typeof facilitySchema>;
