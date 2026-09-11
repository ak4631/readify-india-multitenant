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
  openTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
});

export const vendorScheduleSchema = z.object({
  days: z.array(dayScheduleSchema).length(7),
});

export type VendorScheduleInput = z.infer<typeof vendorScheduleSchema>;
export { DAYS_OF_WEEK };
