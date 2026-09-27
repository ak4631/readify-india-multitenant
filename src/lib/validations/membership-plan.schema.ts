import { z } from "zod";

export const membershipPlanSchema = z
  .object({
    name: z.string().min(2, "Name is required"),
    description: z.string().optional(),
    price: z.number().positive("Price must be greater than 0"),
    durationValue: z.number().int().positive("Duration must be greater than 0"),
    durationUnit: z.enum(["DAYS", "MONTHS", "YEARS", "SESSIONS", "HOURS"]),
    // Hours per day a DAYS/MONTHS/YEARS plan holds its seat. Empty = the whole
    // opening window. Required (see refine below) when isFlexible.
    dailyHours: z
      .number()
      .int()
      .min(1, "Must be at least 1 hour")
      .max(24, "Cannot exceed 24 hours")
      .nullable()
      .optional(),
    // A flexible plan's `price` is a per-hour rate; the customer picks 1-14
    // days at purchase time. Requires durationUnit HOURS and a set dailyHours
    // (so the app can compute price * dailyHours * days instantly, with no
    // extra round trip as the customer moves the day stepper).
    isFlexible: z.boolean().default(false),
  })
  .refine((v) => v.durationUnit !== "HOURS" || v.durationValue <= 24, {
    path: ["durationValue"],
    message: "Hourly plans cannot exceed 24 hours",
  })
  .refine((v) => !v.isFlexible || v.durationUnit === "HOURS", {
    path: ["durationUnit"],
    message: "Flexible plans must use Hours as the duration unit",
  })
  .refine((v) => !v.isFlexible || v.dailyHours != null, {
    path: ["dailyHours"],
    message: "Flexible plans require hours per day",
  })
  .transform((v) => ({
    ...v,
    dailyHours: v.isFlexible
      ? v.dailyHours!
      : ["DAYS", "MONTHS", "YEARS"].includes(v.durationUnit)
        ? (v.dailyHours ?? null)
        : null,
  }));

export type MembershipPlanInput = z.input<typeof membershipPlanSchema>;
