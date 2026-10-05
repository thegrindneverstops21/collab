import express from "express";
import cors from "cors";
import { pool } from "./db/pool";
import { errorHandler, notFound } from "./middleware/errors";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { projectsRouter } from "./modules/projects/projects.routes";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/health/db", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok", database: "connected" });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/projects", projectsRouter);

// Sprint 3+ routers get mounted here

app.use(notFound);
app.use(errorHandler);

export default app;