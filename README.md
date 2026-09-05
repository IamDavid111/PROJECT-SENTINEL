## SentinelQHSE

SentinelQHSE is an enterprise QHSE safety-intelligence application for energy operations. It is built with React, TypeScript, Vite, Supabase Auth, PostgreSQL, Row-Level Security, and Supabase Edge Functions.

## Local development

Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
VITE_MAPBOX_PUBLIC_TOKEN=your-public-mapbox-token
```

Use only the public anon/publishable key in the frontend. Never place `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` or any browser-exposed file.

`VITE_MAPBOX_PUBLIC_TOKEN` is optional. Without it, the dashboard displays a safe configuration state instead of failing. Use a public Mapbox token only; never expose a secret server token.

```bash
npm run dev
```

The local application is available at `http://localhost:5173/`.

## Supabase database setup

1. Create a Supabase project.
2. Enable Email under **Authentication > Providers**.
3. Add `http://localhost:5173/#/reset-password` under **Authentication > URL Configuration > Redirect URLs**.
4. Open [supabase/migrations/202609030001_initial_schema.sql](supabase/migrations/202609030001_initial_schema.sql) in the Supabase SQL Editor.
5. Run the complete migration.
6. Run [supabase/migrations/202609050002_add_organization_region.sql](supabase/migrations/202609050002_add_organization_region.sql) after the initial migration.
7. Confirm these tables exist: `organizations`, `profiles`, `memberships`, `notification_preferences`, `activity_logs`, and `company_settings`.
8. Confirm `organizations.region` exists and the private `organization-assets` storage bucket exists.
9. Confirm RLS is enabled on all application tables.

The migration creates tenant membership helpers, the first-owner organization registration function, role enums, indexes, update timestamps, storage policies, and organization-scoped RLS policies.

Registration uses ISO-backed country data with a global region selector and dependent state/province options. Dashboard server state is managed through TanStack Query in [src/features/dashboard](src/features/dashboard), with organization and filter values included in query keys.

## Edge Function deployment

User invitations require [supabase/functions/admin-invite-user/index.ts](supabase/functions/admin-invite-user/index.ts). The function uses the service role only on the server and validates that the caller is an organization administrator.

With the Supabase CLI installed and the project linked:

```bash
supabase functions deploy admin-invite-user
```

Supabase supplies the function secrets. Do not expose or manually add the service-role key to Vite environment variables.

## Application routes

Public routes:

- `#/sign-in`
- `#/register`
- `#/forgot-password`
- `#/reset-password`
- `#/mfa`
- `#/change-password`

Authenticated workspace routes:

- `#/dashboard`
- `#/users`
- `#/profile`
- `#/preferences`
- `#/activity-log`
- `#/settings`

Workspace navigation and access are derived from the user membership role. Database RLS remains the authoritative enforcement layer.

## Validation

```bash
npm run build
npm run lint
```

The build verifies TypeScript and Vite output. Supabase deployment verification must be performed against the configured project by applying the migration, deploying the Edge Function, and testing authentication, registration, RLS, invitations, preferences, logs, and settings with representative roles.

## Security notes

- Frontend environment variables must contain only the Supabase URL and public anon/publishable key.
- Authenticated organization data is protected by RLS and membership checks.
- Service-role operations belong in Edge Functions, never React components.
- Email confirmation and SMTP should be enabled for production.
- Replace placeholder operational dashboard values with domain data modules before production launch.
