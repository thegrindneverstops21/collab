import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { pool } from "../../db/pool";
import { HttpError } from "../../middleware/errors";
import { LoginInput, RegisterInput } from "./auth.schema";

// Compared against when the email is unknown, so response time doesn't reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

export async function registerUser(input: RegisterInput) {
  const hash = await bcrypt.hash(input.password, 12);

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, avatar_url, created_at, updated_at`,
      [input.name, input.email, hash, input.role]
    );
    return result.rows[0];
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new HttpError(409, "Email is already registered");
    }
    throw err;
  }
}

export async function loginUser(input: LoginInput) {
  const result = await pool.query(
    "SELECT id, password_hash FROM users WHERE email = $1",
    [input.email]
  );
  const user = result.rows[0];

  const valid = await bcrypt.compare(
    input.password,
    user ? user.password_hash : DUMMY_HASH
  );

  if (!user || !valid) {
    throw new HttpError(401, "Invalid email or password");
  }

  const token = jwt.sign({}, env.jwtSecret, {
    subject: user.id,
    expiresIn: env.jwtExpiresInSeconds,
    algorithm: "HS256",
  });

  return { token };
}