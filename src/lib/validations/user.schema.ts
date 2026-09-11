import { z } from "zod";

export const suspendUserSchema = z.object({
  userId: z.string().min(1),
});

export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

export const vendorAccountSchema = z.object({
  vendorId: z.string().min(1),
  name: z.string().trim().min(2, "Enter the account holder's name").max(80),
  email: z.string().trim().email("Enter a valid email address"),
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .regex(/[A-Z]/, "Include an uppercase letter")
    .regex(/[a-z]/, "Include a lowercase letter")
    .regex(/[0-9]/, "Include a number"),
});

export type VendorAccountInput = z.infer<typeof vendorAccountSchema>;
