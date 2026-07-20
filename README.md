# COSSA Vote — Backend

Node.js + Express + MongoDB (Atlas) backend for the online voting system.
Handles the approved-voters allowlist, email-verified registration, admin
two-factor login, and vote casting.

## 1. Install

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and fill in:
- `MONGODB_URI` — your MongoDB Atlas connection string (see the setup guide
  for exactly how to get this).
- `JWT_SECRET` — any long random string.
- `RESEND_API_KEY` / `EMAIL_FROM` / `EMAIL_FROM_NAME` — real email credentials
  so verification codes can actually send, via Resend's HTTP API. See
  `.env.example` for setup steps.
- `ADMIN_SEED_*` — the first electoral officer account's login details.

## 2. Load your student list

Export your official 500-level class list to CSV with columns
`matric,name,level` (see `db/students_cs500.csv` for the format), then run:

```bash
npm run seed:students -- path/to/your-500-level-list.csv
```

Only matric numbers in this table can register. Re-running the command
updates existing rows instead of duplicating them, so you can re-import an
updated list at any time.

## 3. Create the admin account and starter election

```bash
npm run seed:admin
npm run seed:election
```

`seed:election` creates one open election with the six standard COSSA
positions. Add candidates to it from the admin dashboard once that's wired
up, or directly via `POST /api/admin/candidates`.

## 4. Run the server

```bash
npm start
```

The API is now live at `http://localhost:4000`.

## How registration works

1. `POST /api/auth/register` `{ matric, name, email }` — matric + name must
   match a row in `allowed_students` exactly, or it's rejected. A 6-digit
   code is emailed to the student.
2. `POST /api/auth/verify-code` `{ matric, code }` — confirms the code.
3. `POST /api/auth/set-password` `{ matric, password }` — only works once
   verified; creates the login.
4. `POST /api/auth/login` `{ matric, password }` — returns a JWT used as
   `Authorization: Bearer <token>` on every subsequent request.

Admin login is a separate two-step flow (`/api/admin/login/request-otp` then
`/api/admin/login/verify-otp`) since admin accounts are seeded directly, not
self-registered.

## Endpoints at a glance

| Method | Path                              | Auth   | Purpose |
|--------|------------------------------------|--------|---------|
| POST   | /api/auth/register                 | —      | Start registration, sends code |
| POST   | /api/auth/resend-code              | —      | Resend the code |
| POST   | /api/auth/verify-code              | —      | Confirm the code |
| POST   | /api/auth/set-password             | —      | Finish account setup |
| POST   | /api/auth/login                    | —      | Student login |
| POST   | /api/auth/forgot-password          | —      | Request a password reset code (generic response either way) |
| POST   | /api/auth/forgot-password/resend   | —      | Resend the reset code, subject to a 60s cooldown |
| POST   | /api/auth/reset-password           | —      | Verify the code and set a new password |
| POST   | /api/admin/login/request-otp       | —      | Step 1 of admin login |
| POST   | /api/admin/login/verify-otp        | —      | Step 2 of admin login |
| GET    | /api/elections/current             | voter  | Ballot for the open election |
| POST   | /api/vote                          | voter  | Cast a ballot (once) |
| GET    | /api/admin/results                 | admin  | Live vote tallies |
| GET    | /api/admin/candidates              | admin  | List candidates |
| POST   | /api/admin/candidates              | admin  | Add a candidate (Pending) |
| PATCH  | /api/admin/candidates/:id/approve  | admin  | Approve a candidate |
| DELETE | /api/admin/candidates/:id          | admin  | Remove a candidate |
| GET    | /api/admin/voters                  | admin  | Registration/voting status per student |
| GET    | /api/admin/positions               | admin  | Positions in the current election |
| POST   | /api/admin/positions               | admin  | Add a position (fails if a same-name one exists) |
| DELETE | /api/admin/positions/:id           | admin  | Remove a position (fails if it still has candidates) |
| GET    | /api/admin/election                | admin  | Full election record (title, window, status) |
| PATCH  | /api/admin/election                | admin  | Update opensAt/closesAt (ISO strings) |
| PATCH  | /api/admin/election/status          | admin  | Set status to 'Open' or 'Closed' |
| POST   | /api/admin/election/certify         | admin  | Close voting and stamp certifiedAt |
| POST   | /api/admin/voters/reset             | admin  | Clear all votes and hasVoted flags (does not delete accounts) |

## Notes

- **Elections auto-close.** A background check (`utils/electionScheduler.js`)
  runs every 30 seconds by default (`ELECTION_CLOSE_CHECK_MS` in `.env`) and
  flips any election's status from `Open` to `Closed` once its `closesAt`
  time has passed. There's also a same-request check in `castVote` and in
  every election-status read path, so status is never more than a moment
  stale even between scheduler ticks — a vote can't be recorded after the
  deadline just because the interval hasn't run yet. This does not
  auto-*open* an election at `opensAt`; only admins can open one (via the
  Settings tab or `PATCH /api/admin/election/status`).

- Storage is MongoDB Atlas (a free M0 cluster is plenty for a
  department-scale election) — no local database file, so the data survives
  independently of wherever the backend itself is hosted.
- Passwords are hashed with bcrypt; verification/OTP codes expire after 10
  minutes and are cleared after use.
- "One vote per position" is enforced at the database level with a unique
  compound index on `{ positionId, voterMatric }` in the `votes` collection,
  not just in application code. Vote casting runs inside a MongoDB
  transaction (supported on Atlas free clusters) so a student's votes across
  every position are recorded all-or-nothing.
- Unlike SQL, MongoDB has no foreign keys — "matric must be on the approved
  list" is enforced entirely in `auth.controller.js`'s `register()` function,
  not by the database schema itself. Don't add a way to create `User`
  documents that skips that check.
- CORS is restricted to `CLIENT_ORIGIN` from `.env` — set this to wherever
  you serve the HTML files from (e.g. `http://127.0.0.1:5500` for VS Code
  Live Server).
