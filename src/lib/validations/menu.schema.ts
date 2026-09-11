import { z } from "zod";

export const menuCategorySchema = z.object({
  name: z.string().min(2, "Name is required"),
});

export type MenuCategoryInput = z.infer<typeof menuCategorySchema>;

export const menuItemSchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().optional(),
  price: z.number().positive("Price must be greater than 0"),
  isAvailable: z.boolean(),
});

export type MenuItemInput = z.infer<typeof menuItemSchema>;
