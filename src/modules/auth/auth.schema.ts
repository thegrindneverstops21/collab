import { z } from "zod";

const password = z
  .string()
  .min(12, "Password must be at least 12 characters long")
  .refine((p) => Buffer.byteLength(p, "utf-8") <= 72, {
    message: "Password must be at most 72 bytes long",
  });

export const registerSchema = z
  .object({
    name: z.string().trim().min(3).max(50),
    email: z.string().trim().toLowerCase().email().max(100),
    password,
    role: z.enum(["reviewer", "submitter"]),
  })
  .strict();


  export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(100),
    password: z.string().min(12).max(72),
  })
  .strict();

  export type RegisterInput = z.infer<typeof registerSchema>;
  export type LoginInput = z.infer<typeof loginSchema>;