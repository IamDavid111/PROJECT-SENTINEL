# SentinelQHSE Demo Seed

This seed targets the migrated SentinelQHSE schema. It creates only records for the clearly marked `SENTINEL-DEMO` organization. It does not reset the database, delete existing rows, disable RLS, create schema, or seed corrective actions (the migrated schema has no corrective-action table).

## Contents

- One reused or created `Sentinel Energy & Industrial Services Ltd` demo organization.
- 20 confirmed Supabase Auth users with `@example.com` demo addresses and one configured demo-only password.
- 20 organization-scoped profiles and memberships using existing enum roles.
- 10 department, 3 shift, 16 category, 4 severity JSON settings; 8 sites/facilities; synthetic emergency contacts.
- 1,000 non-draft incidents distributed over the historical window, plus 15 incomplete drafts.
- Investigation, incident-people, notification-preference, and selected activity rows where those tables support them.

The incident schema stores department, shift, category, and severity as text snapshots; site and facility are foreign-key relationships. The script uses the schema's actual representation. `incident_evidence` metadata is not fabricated because the project has no physical demo files to back it. No normalized corrective-action data is created because the table does not exist.

## Credentials and target safety

The script creates Auth users with `auth.admin.createUser` in Node, never from browser code or SQL. It requires server-only `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, and `DEMO_USER_PASSWORD` environment variables. The service key, database URL/password, and demo password must never use a `VITE_` prefix or be committed.

Set these variables in the local terminal environment. `.env.local` is already ignored by Git and may be used locally. The seed refuses remote writes unless the project ref in `SUPABASE_URL` matches the direct DB host (`db.<ref>.supabase.co`) or pooler username (`postgres.<ref>`), and that ref is explicitly confirmed. Run this only against a dedicated disposable demo project, not production. It performs upserts/inserts and does not truncate or delete database rows; new Auth identities are created only when the demo email is absent and are reused only when marked as demo accounts. The DB URL is passed through the process environment to the Node PostgreSQL driver, not on a command line.

## Commands

Inspect the planned data without credentials or database access:

```powershell
npm run seed:demo -- --plan
```

Check generated records and transaction SQL without database access:

```powershell
npm run seed:demo -- --dry-run
```

Populate the explicitly confirmed dedicated demo project after setting `SUPABASE_URL`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DEMO_USER_PASSWORD`, and `DEMO_SUPABASE_PROJECT_REF` in the terminal. The database URL must use TLS, and the ref variable must match both connection endpoints:

```powershell
npm run seed:demo -- "--confirm-remote=$env:DEMO_SUPABASE_PROJECT_REF"
```

Set `DEMO_SUPABASE_PROJECT_REF` to the expected 20-character ref. The script verifies it equals the ref in both connection endpoints before any Auth or database write. The generated PostgreSQL executes as a single transaction. Use a TLS-enabled connection string for remote Supabase databases.

Run the read-only report after seeding:

```powershell
npm run seed:demo -- "--validate-only" "--confirm-remote=$env:DEMO_SUPABASE_PROJECT_REF"
```

Validation is read-only and does not require a service-role key or demo password. The current repository has no `supabase/config.toml`, so a local Supabase stack is not configured here. Do not use `supabase db reset` against a remote project; it is destructive. A live SQL catalog was not available during implementation, so the seed performs a target-side table/column/status preflight inside its transaction and aborts if the migrated schema differs.

## Demo sign-in

All 20 demo accounts use the same `DEMO_USER_PASSWORD` value supplied at seed time. The seeded emails are `given.family.demo@example.com`. These are synthetic, confirmed Auth accounts for a dedicated demo project only; no invitation or email is sent.
