import { z } from "zod";

export const trainerSchema = z.object({
  name: z.string().min(2, "Name is required"),
  bio: z.string().optional(),
  experienceYears: z.number().int().nonnegative().optional(),
});

export type TrainerInput = z.infer<typeof trainerSchema>;

export const trainerPricingSchema = z.object({
  price: z.number().positive("Price must be greater than 0"),
  durationValue: z.number().int().positive(),
  durationUnit: z.enum(["DAYS", "MONTHS", "YEARS", "SESSIONS"]),
});

export type TrainerPricingInput = z.infer<typeof trainerPricingSchema>;

const DAYS_OF_WEEK = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export const trainerAvailabilitySlotSchema = z.object({
  dayOfWeek: z.enum(DAYS_OF_WEEK),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
});

export type TrainerAvailabilitySlotInput = z.infer<typeof trainerAvailabilitySlotSchema>;
export { DAYS_OF_WEEK as TRAINER_DAYS_OF_WEEK };
