import { z } from "zod";

export const partnerSchema = z.object({
  name: z.string().trim().min(2, "Enter at least 2 characters").max(100),
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .optional()
    .or(z.literal("")),
  phone: z.string().trim().max(24).optional().or(z.literal("")),
});

export const partnerUserSchema = z.object({
  partnerId: z.string().min(1),
  name: z.string().trim().min(2, "Enter the team member's name").max(80),
  email: z.string().trim().email("Enter a valid email"),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .regex(/[A-Z]/, "Include an uppercase letter")
    .regex(/[a-z]/, "Include a lowercase letter")
    .regex(/[0-9]/, "Include a number"),
  role: z.enum(["PARTNER_ADMIN", "PARTNER_EMPLOYEE"]),
});

export const partnerUserUpdateSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(2, "Enter the team member's name").max(80),
  email: z.string().trim().email("Enter a valid email"),
});

export type PartnerInput = z.infer<typeof partnerSchema>;
export type PartnerUserInput = z.infer<typeof partnerUserSchema>;
export type PartnerUserUpdateInput = z.infer<typeof partnerUserUpdateSchema>;
