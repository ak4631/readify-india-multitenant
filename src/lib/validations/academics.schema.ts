import { z } from "zod";

export const teacherSchema = z.object({
  name: z.string().min(2, "Name is required"),
  bio: z.string().optional(),
  experienceYears: z.number().int().nonnegative().optional(),
});

export type TeacherInput = z.infer<typeof teacherSchema>;

export const courseSchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().optional(),
  subjectId: z.string().optional(),
  price: z.number().positive("Price must be greater than 0"),
  durationValue: z.number().int().positive().optional(),
  durationUnit: z.enum(["DAYS", "MONTHS", "YEARS", "SESSIONS"]).optional(),
  mode: z.enum(["OFFLINE", "ONLINE", "HYBRID"]),
});

export type CourseInput = z.infer<typeof courseSchema>;

export const lectureSchema = z.object({
  title: z.string().min(2, "Title is required"),
  description: z.string().optional(),
  teacherId: z.string().optional(),
  mode: z.enum(["OFFLINE", "ONLINE", "HYBRID"]),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  meetingUrl: z.string().url().optional().or(z.literal("")),
});

export type LectureInput = z.infer<typeof lectureSchema>;
