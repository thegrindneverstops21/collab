import { pool } from "../../db/pool";
import { HttpError } from "../../middleware/errors";
import { CreateProjectInput, UpdateProjectInput } from "./projects.schema";

const PROJECT_FIELDS =
  "p.id, p.owner_id, p.name, p.description, p.created_at, p.updated_at";

const ACCESS_CLAUSE = `(p.owner_id = $2 OR EXISTS (
  SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $2
))`;

// 404 for both "doesn't exist" and "not yours", so private IDs aren't revealed
export async function getAccessibleProject(projectId: string, userId: string) {
  const result = await pool.query(
    `SELECT ${PROJECT_FIELDS} FROM projects p
     WHERE p.id = $1 AND ${ACCESS_CLAUSE}`,
    [projectId, userId]
  );
  if (result.rowCount === 0) throw new HttpError(404, "Project not found");
  return result.rows[0];
}

// Accessible AND owner. Members get 403, outsiders get 404
export async function getOwnedProject(projectId: string, userId: string) {
  const project = await getAccessibleProject(projectId, userId);
  if (project.owner_id !== userId) {
    throw new HttpError(403, "Only the project owner can do this");
  }
  return project;
}

export async function createProject(userId: string, input: CreateProjectInput) {
  const result = await pool.query(
    `INSERT INTO projects (owner_id, name, description)
     VALUES ($1, $2, $3)
     RETURNING id, owner_id, name, description, created_at, updated_at`,
    [userId, input.name, input.description]
  );
  return result.rows[0];
}

export async function listProjects(userId: string, page: number, limit: number) {
  const offset = (page - 1) * limit;

  const [rows, count] = await Promise.all([
    pool.query(
      `SELECT ${PROJECT_FIELDS} FROM projects p
       WHERE ${ACCESS_CLAUSE}
       ORDER BY p.created_at DESC, p.id
       LIMIT $3 OFFSET $4`,
      [null, userId, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM projects p WHERE ${ACCESS_CLAUSE}`,
      [null, userId]
    ),
  ]);

  return { data: rows.rows, page, limit, total: count.rows[0].total };
}

export async function updateProject(
  projectId: string,
  userId: string,
  input: UpdateProjectInput
) {
  await getOwnedProject(projectId, userId);

  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) {
    values.push(input.name);
    sets.push(`name = $${values.length}`);
  }
  if (input.description !== undefined) {
    values.push(input.description);
    sets.push(`description = $${values.length}`);
  }

  values.push(projectId);

  const result = await pool.query(
    `UPDATE projects SET ${sets.join(", ")}, updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING id, owner_id, name, description, created_at, updated_at`,
    values
  );
  return result.rows[0];
}

export async function deleteProject(projectId: string, userId: string) {
  await getOwnedProject(projectId, userId);
  await pool.query("DELETE FROM projects WHERE id = $1", [projectId]);
}

export async function listMembers(projectId: string, userId: string) {
  await getAccessibleProject(projectId, userId);
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, m.added_at
     FROM project_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.project_id = $1
     ORDER BY m.added_at`,
    [projectId]
  );
  return result.rows;
}

export async function addMember(
  projectId: string,
  ownerId: string,
  memberId: string
) {
  await getOwnedProject(projectId, ownerId);

  if (memberId === ownerId) {
    throw new HttpError(400, "The owner already has access to this project");
  }

  const user = await pool.query(
    "SELECT id, name, email, role FROM users WHERE id = $1",
    [memberId]
  );
  if (user.rowCount === 0) throw new HttpError(404, "User not found");
  if (user.rows[0].role !== "reviewer") {
    throw new HttpError(400, "Only reviewers can be assigned to a project");
  }

  try {
    const result = await pool.query(
      `INSERT INTO project_members (project_id, user_id)
       VALUES ($1, $2)
       RETURNING project_id, user_id, added_at`,
      [projectId, memberId]
    );
    return { ...result.rows[0], user: user.rows[0] };
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new HttpError(409, "User is already a member of this project");
    }
    throw err;
  }
}

export async function removeMember(
  projectId: string,
  ownerId: string,
  memberId: string
) {
  await getOwnedProject(projectId, ownerId);

  const result = await pool.query(
    "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, memberId]
  );
  if (result.rowCount === 0) {
    throw new HttpError(404, "Member not found in this project");
  }
}