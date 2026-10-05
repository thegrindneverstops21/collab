import { Router } from "express";
import { z } from "zod";
import { authenticate, AuthUser } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { HttpError } from "../../middleware/errors";
import { pool } from "../../db/pool";
import { paginationSchema } from "../projects/project.schema";
import { idSchema, submissionSchema, commentSchema, reviewSchema, statusSchema } from "./workflow.schema";
import * as service from "./workflow.service";

export const workflowRouter = Router();
workflowRouter.use(authenticate);
const id = validate(idSchema,"params");
const paging = validate(paginationSchema,"query");
workflowRouter.post("/submissions",validate(submissionSchema),async (_req,res) => {
  res.status(201).json(await service.createSubmission(res.locals.user,res.locals.body));
});
workflowRouter.get("/projects/:id/submissions",id,paging,async (_req,res) => {
  const {page,limit}=res.locals.query;
  res.json(await service.listSubmissions(res.locals.params.id,res.locals.user,page,limit));
});
workflowRouter.get("/submissions/:id",id,async (_req,res) => res.json(await service.getSubmission(res.locals.params.id,res.locals.user)));
workflowRouter.patch("/submissions/:id",id,validate(z.object({code:z.string().min(1).max(500000)}).strict()),async (_req,res) => {
  res.json(await service.updateSubmission(res.locals.params.id,res.locals.user,res.locals.body.code));
});
workflowRouter.patch("/submissions/:id/status",id,validate(statusSchema),async (_req,res) => {
  res.json(await service.changeStatus(res.locals.params.id,res.locals.user,res.locals.body.status,res.locals.body.feedback));
});
workflowRouter.delete("/submissions/:id",id,async (_req,res) => {
  await service.deleteSubmission(res.locals.params.id,res.locals.user); res.sendStatus(204);
});
for (const [action,status] of [["approve","approved"],["request-changes","changes_requested"]]) {
  workflowRouter.post(`/submissions/:id/${action}`,id,validate(reviewSchema),async (_req,res) => {
    res.json(await service.changeStatus(res.locals.params.id,res.locals.user,status,res.locals.body.feedback));
  });
}
workflowRouter.post("/submissions/:id/comments",id,validate(commentSchema),async (_req,res) => {
  res.status(201).json(await service.addComment(res.locals.params.id,res.locals.user,res.locals.body.content));
});
for (const kind of ["comments","reviews"] as const) {
  workflowRouter.get(`/submissions/:id/${kind}`,id,paging,async (_req,res) => {
    const {page,limit}=res.locals.query;
    res.json(await service.listHistory(res.locals.params.id,res.locals.user,kind,page,limit));
  });
}
workflowRouter.patch("/comments/:id",id,validate(commentSchema),async (_req,res) => {
  res.json(await service.editComment(res.locals.params.id,res.locals.user,res.locals.body.content));
});
workflowRouter.delete("/comments/:id",id,async (_req,res) => {
  await service.editComment(res.locals.params.id,res.locals.user); res.sendStatus(204);
});
workflowRouter.get("/projects/:id/stats",id,async (_req,res) => res.json(await service.stats(res.locals.params.id,res.locals.user)));
workflowRouter.get("/users/:id/notifications",id,paging,async (_req,res) => {
  if(res.locals.params.id !== (res.locals.user as AuthUser).id) throw new HttpError(403,"You can only access your own notifications");
  const {page,limit}=res.locals.query; const userId=res.locals.user.id;
  const rows=await pool.query("SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3",[userId,limit,(page-1)*limit]);
  const count=await pool.query("SELECT COUNT(*)::int AS total FROM notifications WHERE user_id=$1",[userId]);
  res.json({data:rows.rows,page,limit,total:count.rows[0].total});
});
workflowRouter.patch("/notifications/:id/read",id,async (_req,res) => {
  const r=await pool.query("UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2 RETURNING *",[res.locals.params.id,res.locals.user.id]);
  if(!r.rows[0]) throw new HttpError(404,"Notification not found"); res.json(r.rows[0]);
});
