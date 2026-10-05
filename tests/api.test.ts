import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import { once } from "node:events";
import { Pool } from "pg";
import dotenv from "dotenv";
import { WebSocket } from "ws";

dotenv.config({ quiet: true });
test(
  "complete API workflow in an isolated PostgreSQL schema",
  { timeout: 120000 },
  async (t) => {
    const schema = `test_${Date.now()}_${process.pid}`;
    const connectionString =
      process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    assert.ok(
      connectionString,
      "Set TEST_DATABASE_URL or DATABASE_URL to a PostgreSQL test database",
    );
    const admin = new Pool({ connectionString });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(connectionString);
    url.searchParams.set("options", `-c search_path=${schema},public`);
    process.env.DATABASE_URL = url.toString();
    process.env.JWT_SECRET =
      "integration-test-secret-with-at-least-32-characters";
    const { pool } = await import("../src/db/pool");
    const { default: app } = await import("../src/app");
    const { attachRealtime } = await import("../src/realtime");
    const server = http.createServer(app);
    const sockets = attachRealtime(server);
    t.after(async () => {
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
      if (server.listening)
        await new Promise<void>((resolve) => server.close(() => resolve()));
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    });
    const sql = await readFile("src/db/schema.sql", "utf8");
    await pool.query(sql);
    await pool.query(sql);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api`;
    async function api(
      method: string,
      path: string,
      token?: string,
      body?: unknown,
      status = 200,
    ) {
      const response = await fetch(base + path, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result =
        response.status === 204 ? null : ((await response.json()) as any);
      assert.equal(
        response.status,
        status,
        `${method} ${path}: ${JSON.stringify(result)}`,
      );
      return result;
    }
    async function account(name: string, role: string) {
      const email = `${name}@test.example`;
      const password = "correct-horse-battery";
      const user = await api(
        "POST",
        "/auth/register",
        undefined,
        { name, email, password, role },
        201,
      );
      assert.equal(user.password_hash, undefined);
      const { token } = await api("POST", "/auth/login", undefined, {
        email,
        password,
      });
      return { ...user, token };
    }
    const owner = await account("Owner", "submitter"),
      reviewer = await account("Reviewer", "reviewer"),
      outsider = await account("Outsider", "reviewer");
    let project: any, submission: any, comment: any;
    await t.test(
      "authentication, validation, and profile authorization",
      async () => {
        await api("GET", "/projects", undefined, undefined, 401);
        await api(
          "POST",
          "/auth/login",
          undefined,
          { email: owner.email, password: "wrong" },
          401,
        );
        await api("POST", "/projects", owner.token, { name: "" }, 400);
        await api("GET", `/users/${owner.id}`, outsider.token, undefined, 403);
        const profile = await api("PATCH", `/users/${owner.id}`, owner.token, {
          name: "Updated owner",
        });
        assert.equal(profile.name, "Updated owner");
        await api(
          "GET",
          "/submissions/not-a-uuid",
          owner.token,
          undefined,
          400,
        );
      },
    );
    await t.test("projects and member permissions", async () => {
      project = await api(
        "POST",
        "/projects",
        owner.token,
        { name: "Integration project" },
        201,
      );
      assert.equal((await api("GET", "/projects", owner.token)).total, 1);
      await api(
        "GET",
        `/projects/${project.id}`,
        outsider.token,
        undefined,
        404,
      );
      await api(
        "POST",
        `/projects/${project.id}/members`,
        owner.token,
        { userId: reviewer.id },
        201,
      );
      await api(
        "POST",
        `/projects/${project.id}/members`,
        owner.token,
        { userId: reviewer.id },
        409,
      );
      await api(
        "PATCH",
        `/projects/${project.id}`,
        reviewer.token,
        { name: "No" },
        403,
      );
    });
    await t.test(
      "submission creation delivers a private live notification",
      async () => {
        const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
        await once(ws, "open");
        const authenticated = once(ws, "message");
        ws.send(
          JSON.stringify({ type: "authenticate", token: reviewer.token }),
        );
        assert.equal(
          JSON.parse(String((await authenticated)[0])).type,
          "authenticated",
        );
        const event = once(ws, "message");
        submission = await api(
          "POST",
          "/submissions",
          owner.token,
          {
            projectId: project.id,
            title: "Initial code",
            code: "console.log('hello')",
          },
          201,
        );
        const notification = JSON.parse(String((await event)[0]));
        assert.equal(notification.notification.user_id, reviewer.id);
        ws.close();
        await api(
          "GET",
          `/submissions/${submission.id}`,
          outsider.token,
          undefined,
          404,
        );
        assert.equal(
          (
            await api(
              "GET",
              `/projects/${project.id}/submissions`,
              reviewer.token,
            )
          ).total,
          1,
        );
      },
    );
    await t.test(
      "comments enforce authorship and content validation",
      async () => {
        comment = await api(
          "POST",
          `/submissions/${submission.id}/comments`,
          reviewer.token,
          { content: "Please add an example" },
          201,
        );
        await api(
          "PATCH",
          `/comments/${comment.id}`,
          owner.token,
          { content: "Changed" },
          403,
        );
        await api(
          "PATCH",
          `/comments/${comment.id}`,
          reviewer.token,
          { content: "" },
          400,
        );
        assert.equal(
          (
            await api("PATCH", `/comments/${comment.id}`, reviewer.token, {
              content: "Updated comment",
            })
          ).content,
          "Updated comment",
        );
        assert.equal(
          (
            await api(
              "GET",
              `/submissions/${submission.id}/comments`,
              owner.token,
            )
          ).total,
          1,
        );
      },
    );
    await t.test(
      "review transitions, immutable history and stats",
      async () => {
        await api(
          "POST",
          `/submissions/${submission.id}/approve`,
          owner.token,
          {},
          403,
        );
        await api(
          "PATCH",
          `/submissions/${submission.id}/status`,
          reviewer.token,
          { status: "in_review" },
        );
        await api(
          "POST",
          `/submissions/${submission.id}/request-changes`,
          reviewer.token,
          {},
          400,
        );
        await api(
          "POST",
          `/submissions/${submission.id}/request-changes`,
          reviewer.token,
          { feedback: "Add error handling" },
        );
        await api("PATCH", `/submissions/${submission.id}`, owner.token, {
          code: "console.log('fixed')",
        });
        await api(
          "PATCH",
          `/submissions/${submission.id}/status`,
          owner.token,
          { status: "pending" },
        );
        await api(
          "POST",
          `/submissions/${submission.id}/approve`,
          reviewer.token,
          {},
        );
        await api(
          "POST",
          `/submissions/${submission.id}/approve`,
          reviewer.token,
          {},
          409,
        );
        assert.equal(
          (
            await api(
              "GET",
              `/submissions/${submission.id}/reviews`,
              owner.token,
            )
          ).total,
          2,
        );
        assert.equal(
          (await api("GET", `/projects/${project.id}/stats`, owner.token))
            .approved,
          1,
        );
        const notices = await api(
          "GET",
          `/users/${owner.id}/notifications`,
          owner.token,
        );
        assert.ok(notices.total > 0);
        assert.equal(
          (
            await api(
              "PATCH",
              `/notifications/${notices.data[0].id}/read`,
              owner.token,
              {},
            )
          ).is_read,
          true,
        );
        await api(
          "GET",
          `/users/${owner.id}/notifications`,
          reviewer.token,
          undefined,
          403,
        );
      },
    );
    await t.test("membership revocation and deletion rules", async () => {
      await api("DELETE", `/users/${owner.id}`, owner.token, undefined, 409);
      await api(
        "DELETE",
        `/comments/${comment.id}`,
        reviewer.token,
        undefined,
        204,
      );
      await api(
        "DELETE",
        `/projects/${project.id}/members/${reviewer.id}`,
        owner.token,
        undefined,
        204,
      );
      await api(
        "GET",
        `/submissions/${submission.id}`,
        reviewer.token,
        undefined,
        404,
      );
      await api(
        "DELETE",
        `/submissions/${submission.id}`,
        owner.token,
        undefined,
        204,
      );
      await api(
        "DELETE",
        `/projects/${project.id}`,
        owner.token,
        undefined,
        204,
      );
      await api(
        "DELETE",
        `/users/${outsider.id}`,
        outsider.token,
        undefined,
        204,
      );
      await api("GET", `/users/${outsider.id}`, outsider.token, undefined, 401);
    });
  },
);
