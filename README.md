# Collab API

TypeScript, Express 5, PostgreSQL, JWT authentication, and authenticated WebSocket notifications for collaborative code reviews.

## Local setup

Requires Node.js 22+ and a running PostgreSQL database. Run commands from the repository root.

1. Run `npm install`.
2. Copy `.env.example` to `.env` if you do not already have one. Set `DATABASE_URL` and a random `JWT_SECRET` of at least 32 characters.
3. Run `npm run migrate` to create or upgrade the tables. The migration is repeatable and preserves existing rows, including legacy comment feedback.
4. Run `npm run dev` (defaults to port 3000).

For a compiled build, run `npm run build` then `npm start`.

## Authentication and access

Register with `POST /api/auth/register` using `{ "name": "Alex", "email": "alex@example.com", "password": "a-long-password", "role": "submitter" }`. Roles are `submitter` or `reviewer`; either may be selected at registration. Passwords need at least 12 characters and at most 72 UTF-8 bytes.

Log in with `POST /api/auth/login` using `{ "email": "alex@example.com", "password": "a-long-password" }`. Use the returned token as `Authorization: Bearer <token>` for all other resource endpoints. Tokens expire after one hour.

Profiles and notification feeds are private to their account. Projects are visible to their owner and assigned members. Only owners manage projects and memberships; members of either role may submit code and comment. Only a reviewer with project access may review someone else's submission. Comment edits and deletion belong to the comment author; submission deletion belongs to its author or project owner. Accounts with authored projects, submissions, comments, or reviews cannot be deleted.

## Endpoints

All paths below start with `/api`. Resource identifiers must be UUIDs. Creation returns 201, deletion 204, and other successful requests 200. PATCH requests change only supplied fields. Paginated lists accept `?page=1&limit=20` (maximum limit 100) and return `{ data, page, limit, total }`.

| Method | Path | Body / behavior |
| --- | --- | --- |
| GET | `/health`, `/health/db` | Application/database health; public |
| POST | `/auth/register` | `name`, `email`, `password`, `role` |
| POST | `/auth/login` | `email`, `password`; returns `{ token }` |
| GET / PATCH / DELETE | `/users/:id` | PATCH: `name`, `email`, `avatarUrl` (nullable) |
| POST | `/projects` | `name`, optional `description` |
| GET | `/projects` | Paginated accessible projects |
| GET / PATCH / DELETE | `/projects/:id` | PATCH: `name`, `description` |
| GET / POST | `/projects/:id/members` | POST: `{ "userId": "uuid" }`; GET returns an array |
| DELETE | `/projects/:id/members/:userId` | Revoke member access |
| POST | `/submissions` | `projectId`, `title`, `code`; optional `description`, `filename`, `language` |
| GET | `/projects/:id/submissions` | Paginated submissions |
| GET / DELETE | `/submissions/:id` | Read or delete submission |
| PATCH | `/submissions/:id` | `{ "code": "updated code" }`; author only, pending or changes requested |
| PATCH | `/submissions/:id/status` | `status`, optional `feedback`; same review rules as decision endpoints |
| POST | `/submissions/:id/approve` | `{ "feedback": "Looks good" }` (feedback optional) |
| POST | `/submissions/:id/request-changes` | `{ "feedback": "Please handle errors" }` (required, nonblank) |
| GET | `/submissions/:id/reviews` | Paginated chronological decision history |
| POST / GET | `/submissions/:id/comments` | POST: `{ "content": "Comment text" }`; GET paginated |
| PATCH / DELETE | `/comments/:id` | PATCH: `{ "content": "Updated text" }` |
| GET | `/users/:id/notifications` | Paginated activity feed, newest first |
| PATCH | `/notifications/:id/read` | Mark your notification read |
| GET | `/projects/:id/stats` | Submission total and counts for each status |

Submissions start `pending`. Reviewers can move pending submissions to `in_review`, or decide `approved` / `changes_requested` from either pending or in review. Decisions create immutable review rows in the same transaction as the status update. Requested changes require feedback. An author can edit code and return `changes_requested` to `pending`. Approved submissions are terminal; submit new work as a new submission. Concurrent decisions are serialized with database row locks.

Errors have an `error` message; validation errors also include `details`. Malformed input returns 400, missing/invalid authentication 401, forbidden actions 403, inaccessible or missing resources 404, and conflicts 409. Unexpected server details are logged rather than returned.

## Live updates

Connect to `ws://localhost:3000/ws` and send this first message within five seconds:

```json
{ "type": "authenticate", "token": "your-login-token" }
```

After `{ "type": "authenticated" }`, the server sends `{ "type": "notification", "notification": { ... } }` for your account. Creation/deletion of submissions, comments added, and status changes notify other project participants after the transaction commits. Notifications are also persisted in the activity feed; use that feed to catch up after reconnecting. Expired tokens close the connection. Use HTTPS/WSS when hosting outside local development.

Live delivery is designed for one server process. Multiple instances would need a shared message transport. Membership and profile edits do not generate activity notifications.

## Tests

`npm run build` checks the application types. `npm test` exercises real HTTP endpoints and WebSockets against PostgreSQL, including authentication, validation, membership permissions, comments, review transitions/history, stats, notifications, and deletion. Tests create a unique temporary schema, apply the migration twice, and drop only that schema on completion. Set `TEST_DATABASE_URL` to a dedicated database, or tests use `DATABASE_URL`. The database account needs schema creation privileges. An interrupted test process can leave a `test_*` schema behind.

The sprint list is implemented as a backend API; this repository does not include a frontend.
