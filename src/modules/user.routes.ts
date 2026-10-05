import { Request, Response, Router } from "express";
import { authenticate, AuthUser } from "../../middleware/auth";
import { HttpError } from "../../middleware/errors";
import { idParamSchema, updateProfileSchema } from "./users.schema";
import { deleteUser, getUser, updateUser } from "./users.service";

export const usersRouter = Router();

usersRouter.use(authenticate);

// Validates the :id param and enforces "that account only"
function selfId(req: Request, res: Response): string {
  const { id } = idParamSchema.parse(req.params);
  const me = res.locals.user as AuthUser;
  if (id !== me.id) {
    throw new HttpError(403, "You can only access your own profile");
  }
  return id;
}

usersRouter.get("/:id", async (req, res) => {
  const id = selfId(req, res);
  res.json(await getUser(id));
});

usersRouter.patch("/:id", async (req, res) => {
  const id = selfId(req, res);
  const data = updateProfileSchema.parse(req.body);
  res.json(await updateUser(id, data));
});

usersRouter.delete("/:id", async (req, res) => {
  const id = selfId(req, res);
  await deleteUser(id);
  res.status(204).send();
});