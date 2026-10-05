import { z } from "zod";

export const projectIdSchema = z.object({ id: z.string().uuid() });

export const memberParamsSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(2000).default(""),
  })
  .strict();

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(2000).optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, {
    message: "Provide at least one field to update",
  });

export const addMemberSchema = z
  .object({ userId: z.string().uuid() })
  .strict();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;