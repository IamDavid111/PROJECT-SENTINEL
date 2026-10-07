# SentinelQHSE PostgreSQL demo seed

This runbook describes the reviewed SQL seed in `seed.sql` and its read-only report in `seed_validation.sql`. Neither file has been executed against a database as part of this change.

## What the seed creates

- One reused or clearly marked `Sentinel Energy & Industrial Services Ltd` demo organization.
- 20 organization-scoped profiles and memberships backed by real Supabase Auth users.
- 10 departments, 8 demo Nigerian sites and facilities, 3 shifts, 17 incident categories, and four lowercase severity settings, merged into the existing `company_settings` JSON configuration without replacing unrelated entries.
- 1,200 submitted incidents and 15 drafts in the existing `incidents` table, distributed across 2023-09-29 through 2026-09-29.
- 960 investigations, 900 corrective actions, selected incident-people links, notification preferences, and approximately 330 activity rows.

The database reference-number triggers assign incident and corrective-action references. The seed uses stable record IDs and demo markers for idempotency; it does not reset reference sequences.

The checked-in schema has no normalized departments, shifts, categories, or severity tables. These options use `company_settings`; sites/facilities are normalized. Drafts are `incidents` with `status = 'draft'`. There is no notifications table; notification preferences are seeded. Evidence metadata is intentionally omitted because the seed has no real files or storage objects to reference.

Incident scenarios are weighted rather than evenly distributed: near misses, unsafe conditions, and unsafe acts are most common. Severity uses approximately 60% low, 30% medium, 9% high, and 1% critical. Recent incidents are kept in active workflow statuses. Corrective actions use the existing `open`, `in_progress`, `pending_verification`, and `verified` statuses; `verified` represents completed, and overdue is derived from a past `due_date` on a nonterminal action.

## Demo Auth users

Profiles reference `auth.users(id)`, so SQL cannot safely invent profile-only identities. Create the accounts first with the server-side Admin API helper; it calls `auth.admin.createUser` with confirmed demo accounts and sends no invitations or emails.

Provision Auth users only in a dedicated development/demo Supabase project. The final `seed_validation.sql` is a post-seed validation and is not a preflight: it intentionally fails until the expected demo data exists. Confirm the target project and reviewed migration history before provisioning.

In a PowerShell terminal, provide server-only environment values without adding them to frontend files:

```powershell
$env:SUPABASE_URL = '<dedicated demo Supabase URL>'
$env:SUPABASE_SERVICE_ROLE_KEY = '<server-only service-role key>'
$env:DEMO_USER_PASSWORD = '<private demo-only password of at least 12 characters>'
$env:DEMO_USER_PROVISIONING = 'development'
$env:DEMO_SUPABASE_PROJECT_REF = '<expected 20-character project ref>'
npm run users:demo -- "--confirm-project=$env:DEMO_SUPABASE_PROJECT_REF"
```

For a local Auth stack, set the same `DEMO_USER_PROVISIONING=development` value, point `SUPABASE_URL` at the local endpoint, and run `npm run users:demo -- --local`. The helper refuses `NODE_ENV=production`, never reads a Vite-prefixed key, never prints or changes passwords, and calls `auth.admin.createUser` without sending invitations or emails. It reuses only an account with the exact expected email, full name, both demo metadata markers, and confirmed email; a same-name account at another address stops the run. New addresses use `@sentinelqhse.example`. These addresses are synthetic and must not be used to send mail.

The safe order is: (1) confirm the dedicated development/demo target; (2) create or reuse the 20 Auth users with the server-side helper; (3) review and run the SQL seed against that same target only after approval; (4) run the read-only validation below. The service-role key and demo password belong only in the server-side terminal environment and must never be placed in Vite variables, frontend code, or checked-in files.

The SQL seed verifies all 20 exact email/name Auth identities and refuses to move or overwrite mismatched profiles, memberships, organizations, or generated incident/action records. If the existing demo organization contains older `DEMO-INC-%` seed records, it stops rather than creating a second incident batch. Review those records separately; the seed never deletes them.

## Review and execution

The SQL runs in one transaction. It does not drop, truncate, or delete rows and does not change migrations, RLS policies, application code, or reference-number logic. Use a database-owner maintenance connection to a dedicated demo project; do not use the browser client or put a service-role key in frontend code.

Inspect the plan and static transaction checks without database access:

```powershell
npm run seed:demo -- --plan
npm run seed:demo -- --dry-run
```

After creating/reusing the Auth users, reviewing the SQL, and confirming a local test database target, run from the repository root:

```powershell
npm run seed:demo -- --local
```

For an explicitly reviewed dedicated demo project, set `SUPABASE_DB_URL` and `DEMO_SUPABASE_PROJECT_REF` in the server-side terminal. The runner verifies that the database endpoint ref matches both `DEMO_SUPABASE_PROJECT_REF` and the explicit command confirmation, and requires TLS:

```powershell
# Read-only check before the write:
npm run seed:demo -- "--validate-only" "--confirm-remote=$env:DEMO_SUPABASE_PROJECT_REF"
# Seed only after reviewing this SQL and confirming the target:
npm run seed:demo -- "--confirm-remote=$env:DEMO_SUPABASE_PROJECT_REF"
# Read-only verification after the seed:
npm run seed:demo -- "--validate-only" "--confirm-remote=$env:DEMO_SUPABASE_PROJECT_REF"
```

The read-only validation file can also be run directly with `psql` if preferred:

```powershell
psql "$env:SUPABASE_DB_URL" --set=ON_ERROR_STOP=1 --file=supabase\seed_validation.sql
```

The new seed uses tables and columns from the checked-in schema. That migration directory contains migrations newer than `202609280027_validate_incident_company_configuration.sql`, through `20260930150000_starnet_mock_incident_utc_date_guard.sql`. Before any future remote execution, verify the reviewed SQL against the actual target schema and migration history. There is no local `supabase/config.toml` in this repository, so this implementation was not tested against a local Supabase database.

RLS is not disabled or modified. The seed uses the trusted database-owner connection for bulk inserts, so it is not an authenticated-client/RLS exercise; all created records still use real Auth user IDs and same-organization foreign keys. Existing RLS remains in force for application access after seeding.

The pre-existing `scripts/seed-demo.mjs` is a legacy JavaScript generator and is no longer wired to `npm run seed:demo`. Do not invoke it alongside this SQL seed; it has different identity/reference markers and may create overlapping demo data.
