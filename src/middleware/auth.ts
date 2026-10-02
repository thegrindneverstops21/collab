import { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env";
import { pool } from "../db/pool";

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
    throw new Error("Missing or invalid Authorization header");
  }

  const token = header?.slice(7);

  let sub: string | undefined;
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
    sub = typeof payload.sub === "string" ? payload.sub : undefined;
  } catch (err) {
    throw new Error("Invalid token");
  }

  if(!sub || !uuid.safeParse(sub).success) {
    throw new Error("Invalid token");
  }

  const result = await pool.query<AuthUser>(
    "SELECT id, name, email, role FROM users WHERE id = $1",
    [sub]
  );

  if (result.rowCount === 0) {
    throw new Error("User not found");
  }

  res.locals.user = result.rows[0];
  next();
};

export const requireRole = (...roles: AuthUser["role"][]): RequestHandler => (_req, res, next) => {
    const user = res.locals.user as AuthUser;
    if (!roles.includes(user.role)) {
        throw new Error("You do not have permission to do this");
    }
    next();
};
