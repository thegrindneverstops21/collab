import { RequestHandler } from "express";
import { z } from "zod";

export const validate = (schema: z.ZodType, source: "body" | "params" | "query" = "body"): RequestHandler =>
  (req, res, next) => { res.locals[source] = schema.parse(req[source]); next(); };
