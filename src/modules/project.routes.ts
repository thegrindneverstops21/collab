import { Router } from "express";
import { authenticate, AuthUser } from "../../middleware/auth";
import {
  addMemberSchema,
  createProjectSchema,
  memberParamsSchema,
  paginationSchema,
  projectIdSchema,
  updateProjectSchema,
} from "./projects.schema";
import {
  addMember,
  createProject,
  deleteProject,
  getAccessibleProject,
  listMembers,
  listProjects,
  removeMember,
  updateProject,
} from "./projects.service";

export const projectsRouter = Router();

projectsRouter.use(authenticate);

const me = (res: any) => (res.locals.user as AuthUser).id;

projectsRouter.post("/", async (req, res) => {
  const data = createProjectSchema.parse(req.body);
  res.status(201).json(await createProject(me(res), data));
});

projectsRouter.get("/", async (req, res) => {
  const { page, limit } = paginationSchema.parse(req.query);
  res.json(await listProjects(me(res), page, limit));
});

projectsRouter.get("/:id", async (req, res) => {
  const { id } = projectIdSchema.parse(req.params);
  res.json(await getAccessibleProject(id, me(res)));
});

projectsRouter.patch("/:id", async (req, res) => {
  const { id } = projectIdSchema.parse(req.params);
  const data = updateProjectSchema.parse(req.body);
  res.json(await updateProject(id, me(res), data));
});

projectsRouter.delete("/:id", async (req, res) => {
  const { id } = projectIdSchema.parse(req.params);
  await deleteProject(id, me(res));
  res.status(204).send();
});

projectsRouter.get("/:id/members", async (req, res) => {
  const { id } = projectIdSchema.parse(req.params);
  res.json(await listMembers(id, me(res)));
});

projectsRouter.post("/:id/members", async (req, res) => {
  const { id } = projectIdSchema.parse(req.params);
  const { userId } = addMemberSchema.parse(req.body);
  res.status(201).json(await addMember(id, me(res), userId));
});

projectsRouter.delete("/:id/members/:userId", async (req, res) => {
  const { id, userId } = memberParamsSchema.parse(req.params);
  await removeMember(id, me(res), userId);
  res.status(204).send();
});