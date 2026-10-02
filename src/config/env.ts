import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32, "JWT secret must be at least 32 characters long"),
});

const parsed = schema.safeParse(process.env);

if(!parsed.success) {
    console.error("Environment variable validation error:", parsed.error.issues);
    process.exit(1);
}

export const env = {
    port: parsed.data.PORT,
    databaseUrl: parsed.data.DATABASE_URL,
    jwtSecret: parsed.data.JWT_SECRET,
    jwtExpiresInSeconds: 3600,
};