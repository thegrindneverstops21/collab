import { pool } from "../../db/pool";
import { HttpError } from "../../middleware/errors";
import { UpdateProfileInput } from "./users.schema";

const PUBLIC_FIELDS =
  "id, name, email, role, avatar_url, created_at, updated_at";

export async function getUser(id: string) {
  const result = await pool.query(
    `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`,
    [id]
  );
  if (result.rowCount === 0) throw new HttpError(404, "User not found");
  return result.rows[0];
}

export async function updateUser(id: string, input: UpdateProfileInput) {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) {
    values.push(input.name);
    sets.push(`name = $${values.length}`);
  }
  if (input.email !== undefined) {
    values.push(input.email);
    sets.push(`email = $${values.length}`);
  }
  if (input.avatarUrl !== undefined) {
    values.push(input.avatarUrl);
    sets.push(`avatar_url = $${values.length}`);
  }

  values.push(id);

  try {
    const result = await pool.query(
      `UPDATE users SET ${sets.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length}
       RETURNING ${PUBLIC_FIELDS}`,
      values
    );
    if (result.rowCount === 0) throw new HttpError(404, "User not found");
    return result.rows[0];
  } catch (err: any) {
    if (err?.code === "23505") {
      throw new HttpError(409, "Name or email is already in use");
    }
    throw err;
  }
}

export async function deleteUser(id: string) {
  const deps = await pool.query(
    `SELECT
       EXISTS (SELECT 1 FROM projects    WHERE owner_id     = $1) OR
       EXISTS (SELECT 1 FROM submissions WHERE submitter_id = $1) OR
       EXISTS (SELECT 1 FROM comments    WHERE commenter_id = $1) OR
       EXISTS (SELECT 1 FROM reviews     WHERE reviewer_id  = $1) AS has_history`,
    [id]
  );

  if (deps.rows[0].has_history) {
    throw new HttpError(
      409,
      "Account has projects or review history and cannot be deleted"
    );
  }

  const result = await pool.query("DELETE FROM users WHERE id = $1", [id]);
  if (result.rowCount === 0) throw new HttpError(404, "User not found");
}
