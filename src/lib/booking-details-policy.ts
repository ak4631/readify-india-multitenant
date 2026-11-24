import { z } from "zod";

export const educationOptions = [
  "Class 10 or below",
  "Class 11–12",
  "Graduation",
  "Postgraduation",
  "Working Professional",
  "Other",
] as const;
export const purposeOptions = [
  "Studying",
  "Reading",
  "Exam Preparation",
  "Remote Work",
  "Other",
] as const;
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/, "Enter a mobile number with country code"),
  );
export const bookingDetailsSchema = z
  .object({
    fullName: z.string().trim().min(2).max(100),
    phone: phoneSchema,
    education: z.enum(educationOptions),
    purpose: z.enum(purposeOptions),
    requirements: z.string().trim().max(500).default(""),
  })
  .refine(
    (value) =>
      (value.education !== "Other" && value.purpose !== "Other") ||
      value.requirements.length >= 2,
    { message: "Please describe your requirements when choosing Other" },
  );

export function otpMode() {
  // Production requires an explicit opt-in to the temporary static code.
  return (
    process.env.BOOKING_OTP_MODE ??
    (process.env.NODE_ENV === "production" ? "disabled" : "static")
  );
}
export function acceptsVerification(method: string | null) {
  return method === "sms" || (method === "static" && otpMode() === "static");
}
export function otpChallengeError(
  row: {
    challengeId: string | null;
    challengeExpiresAt: Date | null;
    attempts: number;
  },
  challengeId: string,
  now = Date.now(),
) {
  if (
    !row.challengeId ||
    row.challengeId !== challengeId ||
    !row.challengeExpiresAt ||
    row.challengeExpiresAt.getTime() <= now
  )
    return "This code has expired. Request another code.";
  if (row.attempts >= 5) return "Too many attempts. Request another code.";
  return null;
}
