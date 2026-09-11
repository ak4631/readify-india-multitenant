import { z } from "zod";

export const librarySeatTypeSchema = z.object({
  name: z.string().min(2, "Name is required"),
  totalCount: z.number().int().positive("Must be at least 1"),
});

export type LibrarySeatTypeInput = z.infer<typeof librarySeatTypeSchema>;
