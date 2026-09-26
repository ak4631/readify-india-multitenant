import { z } from "zod";

export const membershipPlanSchema = z
  .object({
    name: z.string().min(2, "Name is required"),
    description: z.string().optional(),
    price: z.number().positive("Price must be greater than 0"),
    durationValue: z.number().int().positive("Duration must be greater than 0"),
    durationUnit: z.enum(["DAYS", "MONTHS", "YEARS", "SESSIONS", "HOURS"]),
    // Hours per day a DAYS/MONTHS/YEARS plan holds its seat. Empty = the whole
    // opening window. Ignored (stored as null) for other units.
    dailyHours: z
      .number()
      .int()
      .min(1, "Must be at least 1 hour")
      .max(24, "Cannot exceed 24 hours")
      .nullable()
      .optional(),
  })
  .refine((v) => v.durationUnit !== "HOURS" || v.durationValue <= 24, {
    path: ["durationValue"],
    message: "Hourly plans cannot exceed 24 hours",
  })
  .transform((v) => ({
    ...v,
    dailyHours: ["DAYS", "MONTHS", "YEARS"].includes(v.durationUnit)
      ? (v.dailyHours ?? null)
      : null,
  }));

export type MembershipPlanInput = z.input<typeof membershipPlanSchema>;
