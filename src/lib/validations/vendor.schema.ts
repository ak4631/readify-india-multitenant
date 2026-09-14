import { z } from "zod";

export const vendorBasicInfoSchema = z.object({
  partnerId: z.string().trim().min(1).optional(),
  categoryId: z.string().trim().min(1, "Select a vendor category"),
  name: z
    .string()
    .trim()
    .min(2, "Enter at least 2 characters")
    .max(80, "Keep the vendor name under 80 characters"),
  description: z
    .string()
    .trim()
    .max(500, "Keep the description under 500 characters")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9][0-9\s-]{5,18}[0-9]$/, "Enter a valid phone number"),
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .optional()
    .or(z.literal("")),
  website: z
    .string()
    .trim()
    .url("Enter a full URL, including https://")
    .optional()
    .or(z.literal("")),
});

export type VendorBasicInfoInput = z.infer<typeof vendorBasicInfoSchema>;

export const vendorAddressSchema = z
  .object({
    addressLine1: z.string().min(2, "Address is required"),
    addressLine2: z.string().optional(),
    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State is required"),
    pincode: z.string().min(4, "Pincode is required"),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  })
  .refine((data) => (data.latitude == null) === (data.longitude == null), {
    message: "Pin the location on the map to set both latitude and longitude",
    path: ["latitude"],
  });

export type VendorAddressInput = z.infer<typeof vendorAddressSchema>;

export const rejectVendorSchema = z.object({
  vendorId: z.string().min(1),
  reason: z.string().min(3, "Provide a rejection reason"),
});
