import { z } from "zod";

const password = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .refine((p) => Buffer.byteLength(p, "utf8") <= 72, {
    message: "Password must be at most 72 bytes",
  });

export const registerSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(255),
    password,
    role: z.enum(["reviewer", "submitter"]),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(255),
    password: z.string().min(1).max(200),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;