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

export const trainerAvailabilitySlotSchema = z
  .object({
    dayOfWeek: z.enum(DAYS_OF_WEEK),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
  })
  .refine((v) => v.endTime > v.startTime, {
    path: ["endTime"],
    message: "Trainer hours must end after they start on the same day",
  });

export type TrainerAvailabilitySlotInput = z.infer<
  typeof trainerAvailabilitySlotSchema
>;
export { DAYS_OF_WEEK as TRAINER_DAYS_OF_WEEK };

export const trainerAvailabilitySchema = z
  .array(trainerAvailabilitySlotSchema)
  .max(100)
  .superRefine((slots, ctx) => {
    for (const day of DAYS_OF_WEEK) {
      const list = slots
        .filter((s) => s.dayOfWeek === day)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      for (let i = 1; i < list.length; i++)
        if (list[i].startTime < list[i - 1].endTime)
          ctx.addIssue({
            code: "custom",
            message: "Trainer availability windows must not overlap",
          });
    }
  });
