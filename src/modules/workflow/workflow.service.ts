import { PoolClient } from "pg";
import { pool } from "../../db/pool";
import { AuthUser } from "../../middleware/auth";
import { HttpError } from "../../middleware/errors";
import { EventEmitter } from "node:events";
import { z } from "zod";
import { submissionSchema } from "./workflow.schema";

export const activity = new EventEmitter();
type Notice = { user_id: string; [key: string]: unknown };
async function transaction<T>(work: (db: PoolClient, notices: Notice[]) => Promise<T>): Promise<T> {
  const db = await pool.connect(); const notices: Notice[] = [];
  let result: T;
  try { await db.query("BEGIN"); result = await work(db, notices); await db.query("COMMIT"); }
  catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
  for (const notice of notices) activity.emit("notification", notice);
  return result;
}
async function project(db: PoolClient, id: string, user: AuthUser) {
  const r = await db.query(`SELECT p.* FROM projects p WHERE p.id=$1 AND
    (p.owner_id=$2 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$2))`, [id, user.id]);
  if (!r.rows[0]) throw new HttpError(404, "Project not found");
  return r.rows[0];
}
async function submission(db: PoolClient, id: string, user: AuthUser) {
  const r = await db.query("SELECT * FROM submissions WHERE id=$1 FOR UPDATE", [id]);
  if (!r.rows[0]) throw new HttpError(404, "Submission not found");
  await project(db, r.rows[0].project_id, user);
  return r.rows[0];
}
async function notify(db: PoolClient, notices: Notice[], projectId: string, actor: string, type: string, message: string, data: object) {
  const r = await db.query(`INSERT INTO notifications(user_id,type,message,data)
    SELECT recipient,$3,$4,$5::jsonb FROM (
      SELECT owner_id AS recipient FROM projects WHERE id=$1
      UNION SELECT user_id FROM project_members WHERE project_id=$1
    ) recipients WHERE recipient <> $2 RETURNING *`, [projectId, actor, type, message, JSON.stringify(data)]);
  notices.push(...r.rows);
}
export async function createSubmission(user: AuthUser, input: z.infer<typeof submissionSchema>) {
  return transaction(async (db, notices) => {
    await project(db, input.projectId, user);
    const r = await db.query(`INSERT INTO submissions(project_id,submitter_id,title,description,filename,language,code)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [input.projectId,user.id,input.title,input.description,input.filename ?? null,input.language ?? null,input.code]);
    await notify(db, notices, input.projectId, user.id, "submission_created", `${user.name} submitted ${input.title}`, { submissionId: r.rows[0].id, projectId: input.projectId });
    return r.rows[0];
  });
}
export async function getSubmission(id: string, user: AuthUser) {
  return transaction(db => submission(db,id,user));
}
export async function listSubmissions(id: string, user: AuthUser, page: number, limit: number) {
  return transaction(async db => {
    await project(db,id,user);
    const rows = await db.query("SELECT * FROM submissions WHERE project_id=$1 ORDER BY created_at DESC,id LIMIT $2 OFFSET $3",[id,limit,(page-1)*limit]);
    const count = await db.query("SELECT COUNT(*)::int AS total FROM submissions WHERE project_id=$1",[id]);
    return { data: rows.rows, page, limit, total: count.rows[0].total };
  });
}
export async function changeStatus(id: string, user: AuthUser, status: string, feedback: string) {
  return transaction(async (db, notices) => {
    const s = await submission(db,id,user);
    if (status === "pending") {
      if (s.submitter_id !== user.id) throw new HttpError(403,"Only the author can resubmit");
      if (s.status !== "changes_requested") throw new HttpError(409,"Only a submission with requested changes can return to pending");
    } else {
      if (user.role !== "reviewer" || s.submitter_id === user.id) throw new HttpError(403,"An independent reviewer is required");
      if (!["pending","in_review"].includes(s.status) || s.status === status) throw new HttpError(409,"Invalid status transition");
      if (status === "changes_requested" && !feedback) throw new HttpError(400,"Feedback is required when requesting changes");
      if (status === "approved" || status === "changes_requested") {
        await db.query("INSERT INTO reviews(submission_id,reviewer_id,decision,feedback) VALUES($1,$2,$3,$4)",[id,user.id,status,feedback]);
      }
    }
    const r = await db.query("UPDATE submissions SET status=$2,updated_at=NOW() WHERE id=$1 RETURNING *",[id,status]);
    await notify(db,notices,s.project_id,user.id,"submission_status",`${s.title}: ${status}`,{ submissionId:id,projectId:s.project_id,status });
    return r.rows[0];
  });
}
export async function updateSubmission(id: string, user: AuthUser, code: string) {
  return transaction(async db => {
    const s = await submission(db,id,user);
    if (s.submitter_id !== user.id) throw new HttpError(403,"Only the author can edit this submission");
    if (!["pending","changes_requested"].includes(s.status)) throw new HttpError(409,"This submission cannot be edited in its current status");
    return (await db.query("UPDATE submissions SET code=$2,updated_at=NOW() WHERE id=$1 RETURNING *",[id,code])).rows[0];
  });
}
export async function deleteSubmission(id: string, user: AuthUser) {
  return transaction(async (db,notices) => {
    const s = await submission(db,id,user); const p = await project(db,s.project_id,user);
    if (s.submitter_id !== user.id && p.owner_id !== user.id) throw new HttpError(403,"Only the author or project owner can delete a submission");
    await db.query("DELETE FROM submissions WHERE id=$1",[id]);
    await notify(db,notices,s.project_id,user.id,"submission_deleted",`${s.title} was deleted`,{ submissionId:id,projectId:s.project_id });
  });
}
export async function addComment(id: string, user: AuthUser, content: string) {
  return transaction(async (db,notices) => {
    const s = await submission(db,id,user);
    const r = await db.query("INSERT INTO comments(submission_id,commenter_id,content) VALUES($1,$2,$3) RETURNING *",[id,user.id,content]);
    await notify(db,notices,s.project_id,user.id,"comment_created",`${user.name} commented on ${s.title}`,{submissionId:id,projectId:s.project_id,commentId:r.rows[0].id});
    return r.rows[0];
  });
}
export async function listHistory(id: string, user: AuthUser, kind: "comments" | "reviews", page: number, limit: number) {
  return transaction(async db => {
    await submission(db,id,user);
    const rows = await db.query(`SELECT * FROM ${kind} WHERE submission_id=$1 ORDER BY created_at,id LIMIT $2 OFFSET $3`,[id,limit,(page-1)*limit]);
    const count = await db.query(`SELECT COUNT(*)::int AS total FROM ${kind} WHERE submission_id=$1`,[id]);
    return {data:rows.rows,page,limit,total:count.rows[0].total};
  });
}
export async function editComment(id: string, user: AuthUser, content?: string) {
  return transaction(async db => {
    const r = await db.query("SELECT * FROM comments WHERE id=$1",[id]); const c = r.rows[0];
    if (!c) throw new HttpError(404,"Comment not found");
    await submission(db,c.submission_id,user);
    if (c.commenter_id !== user.id) throw new HttpError(403,"Only the comment author can change it");
    const result = content === undefined
      ? await db.query("DELETE FROM comments WHERE id=$1 RETURNING id",[id])
      : await db.query("UPDATE comments SET content=$2,updated_at=NOW() WHERE id=$1 RETURNING *",[id,content]);
    if (!result.rows[0]) throw new HttpError(404,"Comment not found");
    return result.rows[0];
  });
}
export async function stats(id: string, user: AuthUser) {
  return transaction(async db => {
    await project(db,id,user);
    const r = await db.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='pending')::int AS pending,
      COUNT(*) FILTER (WHERE status='in_review')::int AS in_review,
      COUNT(*) FILTER (WHERE status='approved')::int AS approved,
      COUNT(*) FILTER (WHERE status='changes_requested')::int AS changes_requested
      FROM submissions WHERE project_id=$1`,[id]);
    return r.rows[0];
  });
}
