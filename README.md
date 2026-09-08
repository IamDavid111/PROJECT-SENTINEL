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
7. Run [supabase/migrations/202609080003_harden_activity_log_rls.sql](supabase/migrations/202609080003_harden_activity_log_rls.sql) after the region migration.
8. Confirm these tables exist: `organizations`, `profiles`, `memberships`, `notification_preferences`, `activity_logs`, and `company_settings`.
9. Confirm `organizations.region` exists and the private `organization-assets` storage bucket exists.
10. Confirm RLS is enabled on all application tables.

The migration creates tenant membership helpers, the first-owner organization registration function, role enums, indexes, update timestamps, storage policies, and organization-scoped RLS policies.

The activity-log hardening migration rejects organizationless activity rows for authenticated reads and inserts, preventing audit data from becoming cross-tenant global data.

Registration uses ISO-backed country data with a global region selector and dependent state/province options. Dashboard server state is managed through TanStack Query in [src/features/dashboard](src/features/dashboard), with organization and filter values included in query keys.

## Master navigation

The authenticated workspace uses six permanent primary areas:

- Dashboard
- Report Incident
- AI Safety Assistant
- Executive Analytics
- HSE Marketplace
- Settings

User Profile, Notification Preferences, Activity Log, and User Management remain accessible as secondary account or administration destinations. Future operational modules are not added as permanent sidebar items.

## Dashboard architecture

The dashboard is an operational command centre, not a generic analytics page. Its sections prioritize:

1. Critical issues and KPI cards
2. Today's activities
3. Performance
4. Risk
5. Compliance
6. Quick actions, notifications, safety map, and AI Safety Summary

The data flow is:

```text
Dashboard components
	-> TanStack Query hooks
	-> dashboardService
	-> Supabase
	-> PostgreSQL with RLS
```

Dashboard implementation files include:

- `src/features/dashboard/DashboardPage.tsx`
- `src/features/dashboard/dashboardTypes.ts`
- `src/features/dashboard/dashboardService.ts`
- `src/features/dashboard/useDashboardData.ts`
- `src/features/dashboard/DashboardCharts.tsx`
- `src/features/dashboard/SafetyMapCard.tsx`
- `src/features/dashboard/AiSafetySummary.tsx`
- `src/features/dashboard/siteSafety.ts`

The `useDashboardData` hook uses stable keys containing the organization ID and filter state, caches results for 30 seconds, and refetches on window focus. The current service retrieves a limited, organization-scoped activity feed and company configuration. Operational KPI and chart datasets remain empty until their underlying modules and tables exist.

## Dashboard filters

The dashboard filter state includes:

- Site
- Department
- Date range
- Severity
- Incident type
- Contractor
- Shift

Filters are part of the TanStack Query key and are applied to available activity metadata. Site, incident, corrective-action, inspection, and audit filtering will become fully data-backed when those operational tables are introduced.

## Supabase data model

Prompt 1 establishes the common organization source of truth:

### Current tables

- `organizations`: company identity, company code, industry, region, country, state, contact details, and logo path.
- `profiles`: one authenticated user profile per `auth.users` record, linked to an organization.
- `memberships`: organization membership and role assignment.
- `notification_preferences`: per-user email, SMS, push, incident, corrective-action, and audit preferences.
- `activity_logs`: organization-scoped audit activity with user, metadata, IP address, location, and timestamp.
- `company_settings`: organization-scoped JSON configuration for working hours, departments, sites, emergency contacts, categories, severity levels, and inspection templates.

### Relationships

```text
auth.users 1 -> 1 profiles
auth.users 1 -> many memberships
organizations 1 -> many profiles
organizations 1 -> many memberships
organizations 1 -> many activity_logs
organizations 1 -> 1 company_settings
auth.users 1 -> 1 notification_preferences
```

### Indexes

The initial migration indexes memberships by user and organization, profiles by organization, and activity logs by organization plus descending creation time. These support tenant lookups and bounded audit feeds.

### Migrations

Apply migrations in order:

1. `202609030001_initial_schema.sql`
2. `202609050002_add_organization_region.sql`
3. `202609080003_harden_activity_log_rls.sql`
4. `202609080004_incident_domain_foundation.sql`
5. `202609080005_harden_incident_rls.sql`

The region migration adds `organizations.region` and updates the organization-owner registration function. The activity-log migration removes organizationless authenticated reads/inserts and requires a valid organization membership for audit data access. The incident migrations add the incident domain, private evidence storage, organization-scoped references, and role-aware incident/evidence policies.

## RLS and tenant isolation

RLS is the actual security boundary. Frontend navigation and role checks are not sufficient by themselves.

The current policies enforce:

- Members can read only their organization.
- Organization and company settings are administrator-managed.
- Profiles can be updated by the profile owner or organization administrators.
- Membership management is administrator-only.
- Notification preferences are self-service only.
- Activity logs require a non-null organization and organization membership.
- Organization asset storage is private and organization-scoped.

Every dashboard query must include the authenticated organization ID, while PostgreSQL RLS independently prevents cross-tenant access.

## Roles and permissions

The supported roles are:

- Super Administrator
- Organization Administrator
- QHSE Manager
- Site Supervisor
- Safety Officer / HSE Officer
- Auditor
- Maintenance Engineer
- Field Worker
- Contractor
- Executive / Management

The sidebar, quick actions, administration controls, and future-module routes are role-aware. Executive and field-worker experiences do not expose organization administration controls. This UI behavior supplements, but never replaces, Supabase RLS and backend authorization.

## Mapbox safety map

The safety map uses Mapbox only. Configure the optional public token:

```env
VITE_MAPBOX_PUBLIC_TOKEN=your-public-mapbox-token
```

Without the token, the dashboard remains usable and displays a configuration state. Without real site data, it displays a no-data state. The site status model supports `normal`, `warning`, `critical`, and `unknown`; insufficient data is never treated as normal.

The status calculator is in `src/features/dashboard/siteSafety.ts`. It is designed to incorporate incident severity, overdue corrective actions, inspection findings, risk assessments, and compliance issues when those data sources exist.

## AI Safety Summary

The AI Safety Summary is a foundation only. It contains sections for top risks, high-risk locations, common hazards, recommendations, and recent incident summaries, but it does not generate or claim AI insights.

The intended future architecture is:

```text
Authorized QHSE data
	-> secured retrieval layer
	-> AI Safety Intelligence
	-> dashboard summary and AI Assistant
```

The current component receives organization and role context but does not query Supabase directly and does not contain an AI provider or unrestricted data access.

## Future-module placeholders

These routes are protected placeholders, not completed modules:

- `#/incidents`
- `#/corrective-actions`
- `#/inspections`
- `#/audits`
- `#/reports`

They exist so KPI drill-downs and quick actions have honest destinations. They do not fabricate records or claim operational functionality.

The long-term data model is expected to extend the organization root with departments, sites, facilities, contractors, incidents, investigations, corrective actions, near misses, hazards, risk assessments, inspections, findings, audits, compliance, certificates, objectives, and procurement. Prompt 2 intentionally does not build all of those modules.

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
- `#/demo`

Authenticated workspace routes:

- `#/dashboard`
- `#/report-incident`
- `#/ai-assistant`
- `#/executive-analytics`
- `#/marketplace`
- `#/incidents`
- `#/corrective-actions`
- `#/inspections`
- `#/audits`
- `#/reports`
- `#/users`
- `#/profile`
- `#/preferences`
- `#/activity-log`
- `#/settings`

Workspace navigation and access are derived from the user membership role. Database RLS remains the authoritative enforcement layer.

## Incident and near-miss foundation

Prompt 3 establishes the report/classify foundation for this lifecycle:

```text
REPORT -> CLASSIFY -> ASSIGN -> INVESTIGATE -> CORRECTION -> ROOT CAUSE -> CORRECTIVE ACTION -> VERIFICATION -> CLOSE
```

Only the report/classify foundation is implemented in this stage. Investigation, root cause, CAPA, verification, and closure workflows are intentionally deferred.

### Incident tables

The incident migration adds:

- `sites`: organization-scoped operational locations with code, address, and optional coordinates.
- `facilities`: organization-scoped facilities associated with sites.
- `incident_sequences`: transaction-safe organization reference allocation.
- `incidents`: the report record, classification, status, severity, people associations, immediate correction, and timestamps.
- `incident_people`: normalized affected-person and witness foundation.
- `incident_evidence`: private-storage metadata for incident evidence files.

### Incident types

The controlled `incident_report_type` values are:

- `incident`
- `near_miss`
- `unsafe_act`
- `unsafe_condition`
- `environmental_incident`

### Incident statuses

The current controlled lifecycle is:

- `draft`
- `submitted`
- `under_review`
- `closed`

The next roadmap stage will extend the workflow without replacing these foundations.

### Incident data captured

Incident records support:

- Organization, site, and facility association
- Database-generated human-readable reference numbers such as `INC-2026-000001`
- Title and description
- Occurrence and report timestamps
- Location, department, and work/activity context
- Authenticated reporter and creator
- Contractor involvement
- Actual and potential severity
- Configurable incident category
- Environmental, injury/illness, property-damage, and work-related indicators
- Immediate correction/action
- Audit timestamps

Immediate correction is intentionally distinct from future corrective action.

### Incident routes

- `#/report-incident`: report-type selector and structured reporting form.
- `#/report-incident?draft=<id>`: resume an owned draft.
- `#/my-reports`: paginated incident listing with search and filters.
- `#/incident-detail?id=<id>`: incident detail foundation.

### Incident data layer

Incident services and hooks are located under `src/features/incidents`:

- `incidentTypes.ts`: domain contracts and list filters.
- `incidentSchemas.ts`: draft, submission, evidence, witness, and filter validation.
- `incidentQueryKeys.ts`: organization-aware, filter-aware query keys.
- `incidentService.ts`: organization-context resolution, list/detail queries, draft mutations, submission, evidence, and activity operations.
- `useIncidentData.ts`: TanStack Query hooks and mutation invalidation.

Organization context is derived from the current Supabase session, profile, and membership. The UI cannot choose an arbitrary organization as its security authority.

### Draft/submission lifecycle

Drafts:

- May be incomplete.
- Belong to the authenticated organization and creator.
- Can be resumed from My Reports.
- Do not enter submitted/active workflow.
- Do not trigger investigation or CAPA.

Submission:

- Uses stricter Zod validation.
- Requires a draft owned by the current user.
- Sets status to `submitted`.
- Sets `reported_at`.
- Uses the database-generated reference.
- Records activity-log events.
- Navigates to the incident detail route.

### Evidence storage

Evidence uses the private `incident-evidence` bucket. Supported files include common images, PDF, Word, spreadsheet, and plain-text evidence, with a 10 MB limit.

Storage paths use:

```text
organization_id/incident_id/uploader_id/file_name
```

The application never exposes public evidence URLs. Downloads use authenticated Supabase Storage access. Upload, download, and removal events are recorded in `activity_logs`.

### Incident RLS and RBAC

The incident RLS hardening migration adds:

- `can_view_incident()`
- `can_create_incident()`
- `can_manage_incident()`
- Immutable incident organization ownership
- Controlled status transition enforcement
- Role-aware incident visibility and creation
- Owner-or-manager draft/evidence write rules
- Organization/incident/uploader storage path checks

Auditors and executives have read-oriented access and cannot create incident records. Field workers and contractors can create their permitted reports and manage their own drafts, but cannot administer the organization or arbitrarily change submitted statuses. Managers can manage operational records according to the database policies.

Frontend role-aware navigation is only a usability layer. PostgreSQL RLS and storage policies are the final security boundary.

### Incident dashboard integration

The existing dashboard now consumes real incident data where available:

- Total incidents
- Submitted/open incidents
- Under-review incidents
- Closed incidents
- Near misses
- Recent incidents

Incident counts are organization-scoped and respond to dashboard date, site, department, severity, and report-type filters. Metrics whose underlying modules do not exist remain unavailable rather than showing fabricated values. Historical trends, corrective-action metrics, inspection metrics, and audit metrics remain deferred until their operational tables exist.

## Prompt 3 deferred scope

The following are intentionally not implemented in the incident foundation:

- Full investigation workspace
- Root-cause analysis
- 5 Whys or fishbone analysis
- Corrective-action assignment and lifecycle
- Verification workflow
- CAPA management
- Advanced risk scoring
- Predictive analytics
- AI incident summaries or recommendations
- Complete notification engine
- Offline synchronization
- Advanced permit-to-work functionality

These belong to the next roadmap workstream and will build on the current incident records, activity history, evidence metadata, and RLS model.

## Validation

```bash
npm run build
npm run lint
```

The build verifies TypeScript and Vite output. Supabase deployment verification must be performed against the configured project by applying the migration, deploying the Edge Function, and testing authentication, registration, RLS, invitations, preferences, logs, and settings with representative roles.

The local validation baseline is:

```bash
npm run lint
npm run build
```

The build passes. Lint currently reports five non-blocking existing warnings in `src/App.tsx` related to effect dependencies, state updates in effects, render purity, and immutability. No TypeScript build errors remain.

## Security notes

- Frontend environment variables must contain only the Supabase URL and public anon/publishable key.
- Authenticated organization data is protected by RLS and membership checks.
- Service-role operations belong in Edge Functions, never React components.
- Email confirmation and SMTP should be enabled for production.
- The dashboard does not fabricate operational metrics. Incident, site, corrective-action, inspection, audit, and compliance tables are still required for real KPI values.
- The Mapbox token is optional locally but required for interactive maps.
- The Edge Function requires Deno/Supabase tooling for native validation and deployment; the frontend build does not validate Edge Function runtime behavior.
- Cross-tenant RLS and all ten live role workflows require representative accounts in the deployed Supabase project.
- Replace future-module placeholders with domain modules before production launch.
