import { z } from "zod";
export const idSchema = z.object({ id: z.string().uuid() });
export const submissionSchema = z
  .object({
    projectId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(10000).default(""),
    filename: z.string().max(255).optional(),
    language: z.string().max(50).optional(),
    code: z.string().min(1).max(500000),
  })
  .strict();
export const commentSchema = z
  .object({ content: z.string().trim().min(1).max(10000) })
  .strict();
export const reviewSchema = z
  .object({ feedback: z.string().trim().max(10000).default("") })
  .strict();
export const statusSchema = z
  .object({
    status: z.enum(["pending", "in_review", "approved", "changes_requested"]),
    feedback: z.string().trim().max(10000).default(""),
  })
  .strict();
