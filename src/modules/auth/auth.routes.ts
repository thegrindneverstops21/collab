import { Router } from "express";
import { authLimiter } from "../../middleware/rateLimit";
import { loginSchema, registerSchema } from "./auth.schema";
import { loginUser, registerUser } from "./auth.service";

export const authRouter = Router();

authRouter.post("/register", authLimiter, async (req, res) => {
  const data = registerSchema.parse(req.body);
  const user = await registerUser(data);
  res.status(201).json(user);
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const data = loginSchema.parse(req.body);
  const result = await loginUser(data);
  res.json(result);
});