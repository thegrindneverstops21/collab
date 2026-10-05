import { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env";
import { pool } from "../db/pool";
import { HttpError } from "./errors";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "reviewer" | "submitter";
}

const uuid = z.string().uuid();

export const authenticate: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing or malformed Authorization header");
  }

  const token = header.slice(7);

  let sub: string | undefined;
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
    sub = typeof payload === "string" ? undefined : payload.sub;
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }

  if (!sub || !uuid.safeParse(sub).success) {
    throw new HttpError(401, "Invalid token");
  }

  // Outside the try/catch on purpose: a DB outage should be a 500, not a fake 401
  const result = await pool.query<AuthUser>(
    "SELECT id, name, email, role FROM users WHERE id = $1",
    [sub]
  );

  if (result.rowCount === 0) {
    throw new HttpError(401, "Account no longer exists");
  }

  res.locals.user = result.rows[0];
  next();
};

export const requireRole =
  (...roles: AuthUser["role"][]): RequestHandler =>
  (_req, res, next) => {
    const user = res.locals.user as AuthUser;
    if (!roles.includes(user.role)) {
      throw new HttpError(403, "You do not have permission to do this");
    }
    next();
  };