import { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const notFound: RequestHandler = (_req, _res, next) => next(new HttpError(404, "Route not found"));
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.issues }); return;
  }
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
  if (err.type === "entity.parse.failed") { res.status(400).json({ error: "Invalid JSON" }); return; }
  if (err.type === "entity.too.large") { res.status(413).json({ error: "Request body too large" }); return; }
  if (err.code === "23505") { res.status(409).json({ error: "A record with these details already exists" }); return; }
  if (err.code === "23503") { res.status(409).json({ error: "Related record no longer exists or is still in use" }); return; }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
