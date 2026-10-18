import { z } from "zod";

const DAYS_OF_WEEK = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export const dayScheduleSchema = z.object({
  dayOfWeek: z.enum(DAYS_OF_WEEK),
  isClosed: z.boolean(),
  openTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid HH:MM time"),
  closeTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid HH:MM time"),
});

export const vendorScheduleSchema = z.object({
  days: z
    .array(dayScheduleSchema)
    .length(7)
    .refine(
      (days) => new Set(days.map((day) => day.dayOfWeek)).size === 7,
      "Provide each day exactly once",
    ),
});

export type VendorScheduleInput = z.infer<typeof vendorScheduleSchema>;
export { DAYS_OF_WEEK };
