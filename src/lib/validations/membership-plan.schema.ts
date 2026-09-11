import { z } from "zod";

export const membershipPlanSchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().optional(),
  price: z.number().positive("Price must be greater than 0"),
  durationValue: z.number().int().positive("Duration must be greater than 0"),
  durationUnit: z.enum(["DAYS", "MONTHS", "YEARS", "SESSIONS"]),
});

export type MembershipPlanInput = z.infer<typeof membershipPlanSchema>;
