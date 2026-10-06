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

## Incident closure authorization

Apply [the incident closure migration](supabase/migrations/202610060001_incident_closure_delegation.sql)
before releasing the updated frontend in any additional environment. On 2026-10-06, this migration
was applied to the approved linked project and verified with 44 hosted, transaction-rolled-back
database assertions. Existing incident records and pending AI migrations were not changed.

- **Settings > Who can close incidents?** lets an active Super Administrator grant/revoke access
  for existing organization users with defined active roles. Type a full or partial name into
  **Search organization users**; the roster is hidden until a name is entered. Matching is
  case-insensitive and restricted to the server-authorized organization roster.
  Changes save immediately, separately
  from the Company Settings form.
- Super Administrators always have closure authority. Other users need explicit delegation;
  the Roles & Permissions `close_incidents` label alone does not grant this operation.
- Delegates can select **My reported incidents** or **All organization incidents** in Incident
  Management. The status filter includes all open reported incidents and closed incidents.
- **Close incident** requires a root cause, a completed corrective-action description, and completion
  confirmation. An investigation is not required. Existing linked actions must be verified/closed;
  this form does not verify or complete them.
- The database atomically stores human-authored closure evidence, the authenticated closer,
  a reliable closure timestamp, the closed status, and an activity event. Direct status updates
  cannot bypass the form. Drafts and already-closed incidents cannot be closed.
- Delegation stops working if the account becomes inactive, the assigned role changes, the custom
  role is disabled, or membership no longer matches. Regrant access after a role change if appropriate.
- Existing closed incidents are not rewritten or backfilled with fabricated evidence. Their detail
  page explicitly identifies missing structured closure records.
- The legacy closure RPC still requires delegation and derives evidence from existing completed
  investigations and verified/closed actions. Mock seeding that creates closed reports therefore
  also requires the administrator to have closure authority.

Run the focused database regression with:

```powershell
npx supabase test db supabase\tests\incident_closure.sql --local
npx deno test --no-lock --allow-read --sloppy-imports --config supabase\functions\deno.json scripts\test-incident-closure.ts
```

For the local-only frontend, no hosting publication is needed. Run the VS Code task
**SentinelQHSE local frontend** or `npm run dev`, open the local URL, and sign in
as a Super Administrator to configure closure delegation.

The full database suite is self-contained, including RBAC authorization and permission-editing
fixtures. It does not require existing customer accounts and rolls back all test records:

```powershell
npx supabase test db --local
```

## Phase 2 shared Safety Intelligence foundation (Batch 3)

The read-only [safety-intelligence endpoint](supabase/functions/safety-intelligence/index.ts)
accepts `{ "days": 90 }` (30 or 90), optionally with `siteId`. It resolves the authenticated
user, active organization membership and AI permission using the same
[access helpers](supabase/functions/ai-service/access.ts) as Phase 1. It needs only Supabase
server URL/anon configuration and the caller token; no OpenAI or service-role key is used.
No UI, guidance text, assistant grounding, prediction or hosted deployment is included in Batch 3.
Deterministic reads have structured traceable errors; they do not create provider-request audit rows.

The [shared contract](supabase/functions/_shared/safetyIntelligenceContracts.ts),
[retrieval](supabase/functions/_shared/safetyIntelligenceRetrieval.ts) and
[calculations](supabase/functions/_shared/safetyIntelligenceCalculations.ts) are the single
source for future cards and assistant numerical evidence:

- Existing RLS remains authoritative; no new site restrictions were approved. Broad roles and valid
  closure delegates retain organization incident visibility. Other users receive personal coverage.
  AI permission never grants record access, and closure delegation never grants independent action
  or investigation access. Child records must also have a readable parent incident.
- Optional site filters narrow authorized records; they are not site-assignment security.
- Sources include incidents, actions, investigations, recorded causes/findings, structured closure
  evidence and referenced sites/facilities. Missing source tables/read failures fail explicitly.
  There are no inspections, operational audits, procedure/regulatory libraries or trained models.
- Reads use ordered UUID keyset pagination (500/page, 10,000/source maximum), caller tenant predicates,
  a 20-second request deadline and an explicit incomplete state when capped. Coverage never exposes
  hidden organization totals. Multi-table reads are live observations, not an atomic historical snapshot.
- UTC half-open reporting windows use `reported_at`, exclude drafts and include all five report types.
  All five nonterminal reported statuses count as open. Missing/invalid dates are disclosed.
- Effective severity is the higher recognized actual/potential Low/Medium/High/Critical value.
  Unrecognized supplied classifications require explicit mapping, not silent Low defaults.
- Version `safety-intelligence-v1` defines the deterministic reported-event index:
  `100 * (0.70 * HighOrCritical / classifiedReports + 0.30 * openHighOrCritical / classifiedReports)`.
  Require complete eligible coverage and at least 10 classified reports. Low <30, Medium 30..<60,
  High >=60, before rounding. This is an uncalibrated prioritization index, not accident probability,
  exposure-adjusted performance or ML. Historical point changes are unavailable without prior states.
- Near misses compare month-to-date with the same elapsed portion of the previous month, capped at
  its end. A zero baseline has no percentage. Increased reporting does not prove increased danger.
- Category shares include uncategorized events in the denominator; no hazard taxonomy is invented.
- Facility/site rankings remain separate: open Critical, open High, total High/Critical, total reports,
  then name/ID. Old open backlog, recent counts and authorized overdue-action drivers are separate inputs
  for later planning/guidance batches. Date-only actions become overdue after their UTC due day ends;
  verified/closed actions are terminal. Missing due dates remain disclosed.
- Resolution uses `reported_at` to trusted `incident_closures.closed_at`, grouped by closure window.
  Legacy records without evidence and invalid durations are excluded with counts. No `updated_at`
  substitutes or fabricated backfills. Comparisons use consecutive equal-duration closure windows.
- Evidence excerpts are limited to 80 records/24,000 characters, separate from aggregate retrieval.
  They are observed, non-authoritative inputs, not model instructions or generated recommendations.

The [frontend service](src/features/safety-intelligence/safetyIntelligenceService.ts) validates
responses/errors. [Query hooks](src/features/safety-intelligence/useSafetyIntelligence.ts) isolate
user/organization/visibility/site/filters/methodology, refresh on entry/focus and hourly while active,
and expose normal query refetch for manual refresh. Incident submissions, updates, offline sync,
closure and delegation invalidate affected snapshots; operational update events do so as well.
No scheduled/automatic OpenAI calls are introduced.

Focused checks (no provider credentials or paid AI calls):

```powershell
npx --yes deno test --no-lock --config supabase\functions\deno.json supabase\functions\safety-intelligence supabase\functions\ai-service
npx --yes deno test --no-lock --allow-read --allow-env=NODE_ENV --sloppy-imports --config supabase\functions\deno.json scripts\test-safety-intelligence.ts scripts\test-incident-closure.ts
npx supabase test db supabase\tests\safety_intelligence.sql supabase\tests\incident_closure.sql --local
npm run build
npm run lint
```

Deploy the endpoint only at the approved hosted readiness checkpoint. Until then, the frontend
service intentionally fails if the function is unavailable rather than returning fabricated data.

On 2026-10-06, the user approved early deployment of **only** the read-only `safety-intelligence`
endpoint to the existing linked project so the cards can read actual platform data. This endpoint
is now deployed; OPTIONS returned 200 and unauthenticated POST returned 401. Signed-in card
verification remains with the user. No database migrations, provider deployment or official record
changes were made. Remaining Batch 9 work is still deferred.
Use the existing dependency map when deploying:

```powershell
npx supabase functions deploy safety-intelligence --project-ref YOUR_PROJECT_REF --use-api --import-map supabase\functions\deno.json
```

### Safety Intelligence shell (Batch 4)

The existing `#ai-assistant` URL now opens **Safety Intelligence**, preserving bookmarks and
the Sparkles icon/position. The page has two sections: **AI Safety Intelligence** and
**AI Safety Assistant**. Settings is under ACCOUNT immediately after Administration, retaining its
Super Administrator access requirement and existing route. Incident Management remains in the account navigation.
Primary items and the intelligence header shortcut remain permission-filtered.

The [page shell](src/features/safety-intelligence/SafetyIntelligencePage.tsx) uses the shared
snapshot hook and existing light/dark panels. It shows loading, retryable errors, empty and incomplete
coverage states, organization/personal scope and the UTC snapshot timestamp. It does not show stale
successful results after a failed refresh. Refresh is read-only and makes no provider calls.
An unavailable snapshot endpoint produces a genuine service error rather than demo results.
Batch 4 introduced no KPI cards, chat controls, generated recommendations or placeholder metrics.

### Six KPI cards (Batch 5)

[SafetyKpiCards](src/features/safety-intelligence/SafetyKpiCards.tsx) displays only shared snapshot
results: deterministic risk index, high-risk count/open count, comparable month-to-date near-miss
reporting, most common reported category, highest-risk facility/site and reliable closure duration.
The reporting window defaults to 90 days; 30/90 buttons refresh the shared query and its cache key.
Near-miss periods remain month-to-date and resolution cohorts use closure dates, not reporting dates.

Unknown/incomplete metrics are labeled unavailable or insufficient; known partial incident counts
are identified as partial. Rankings require complete classification/location coverage. Site rankings
are used only when no facility cohort exists and site coverage is complete. Caller-visible or
incomplete action counts never imply complete organization action coverage. Historic risk-score
point changes remain explicitly unavailable. No fabricated deltas or hazard taxonomy are added.
Cards disclose classified/closure samples, uncategorized records and legacy/invalid closure exclusions.
High/Medium/Low use red/amber/green; the grid adapts from three columns to two to one.
This batch introduces no provider calls, recommendations, predictions or chat UI.

### High-risk locations and advisory guidance (Batch 6)

[Shared deterministic guidance](supabase/functions/_shared/safetyLocationGuidance.ts) consumes the
existing authorized snapshot without another endpoint/provider call. The
[location panel](src/features/safety-intelligence/SafetyLocations.tsx) preserves the canonical ranking
and stable tie-breaks, selects up to three locations with High/Critical reports, and never mixes
facilities with sites. Incomplete classifications/locations withhold a reliable ranking.

Guidance explains actual open High/Critical report counts, closed high-risk report history and known
overdue action drivers. It is rule-based, advisory and explicitly not AI-generated; it invents no causes
or completed actions. Each item identifies its snapshot aggregate source and presents up to three
authorized supporting incident examples where available. Bounded/missing excerpts are disclosed;
incident examples are not claimed to prove a particular action is overdue. Detail links use authorized
IDs and existing detail-route access checks. No records are modified, and no inference of compliance
or trained prediction is made. Related cause text is not called a verified recurring cause without
additional validated evidence.

```powershell
npx --yes deno test --no-lock --config supabase\functions\deno.json supabase\functions\safety-intelligence\guidance_test.ts
node scripts\test-safety-intelligence-shell.mjs
```

### Fourteen-day planning indicators (Batch 7)

[Shared planning indicators](supabase/functions/_shared/safetyPlanningIndicators.ts) and the
[planning panel](src/features/safety-intelligence/SafetyPlanningOutlook.tsx) reuse existing authorized
snapshot inputs; no new provider calls, endpoints or database writes are required.
This is a deterministic view of current priorities for the next 14 days, not a trained prediction,
probability, confidence estimate or authoritative forecast.

- High: open Critical report or overdue unfinished action linked to a Critical report.
- Medium: otherwise open High, High/Critical reported within the latest 14 days, or overdue unfinished action.
- Low: no observed qualifying drivers, with complete usable evidence and at least 10 classified reports
  within 90 days. Low does not assure safety.
- Sparse history shows insufficient history. Missing dates/classifications, incomplete retrieval,
  unavailable facility assignments or caller-visible-only action coverage show incomplete evidence.
  Known High/Medium drivers remain visible as observed priorities, never complete indicators.
- The evidence window is always 90 days and recent reporting window 14 days, independent of the
  30/90-day KPI toggle. Current backlog includes older open incidents/actions. Facilities and sites
  are never mixed; site fallback applies only when no facility cohort is available. Only referenced,
  authorized locations with evidence/backlog are represented, not every site with no records.
- Each location displays actual counts, preventive human-review guidance, methodology and source/coverage
  limitations. Advice does not invent causes, close reports or complete/verify actions.

```powershell
npx --yes deno test --no-lock --config supabase\functions\deno.json supabase\functions\safety-intelligence\planning_test.ts
node scripts\test-safety-intelligence-shell.mjs
```

```powershell
node scripts\test-safety-intelligence-shell.mjs
node scripts\test-admin-navigation.mjs
```

### Authorized Safety Copilot grounding (Batch 8)

The existing [AI handler](supabase/functions/ai-service/handler.ts) now supports an explicit
`feature: "safety_copilot"` request with an existing private `sessionId`, `prompt` and optional
`days` (30/90, default 90) / `siteId`. The generic Phase 1 request remains unchanged.
[sendSafetyCopilotMessage](src/features/ai/aiService.ts) provides the frontend entry point.
No assistant UI, RAG, dependencies or migrations are added in this batch.

- The server selects immutable `safety-copilot-grounded-v1` instructions. Identity, tenant,
  prompt instructions and record permissions cannot be overridden by request fields.
- Each turn retrieves operational rows with the caller's token through the shared authorized
  retrieval/calculation layer. AI permission is not a record-access grant; child evidence still
  requires readable parents, and optional site filters only narrow existing RLS visibility.
- Canonical metrics, windows, source coverage, known location drivers, deterministic guidance and
  planning indicators enter the context with selected authorized incident/action/investigation/
  cause/finding/closure evidence. No inspections, operational audits, procedures or regulatory
  library is supplied. Missing/partial data and bounded examples are explicit, not invented.
- Operational context is at most 16,000 characters; context, current prompt and complete history
  exchanges together are at most 24,000 characters (a character bound, not an exact token count).
  Up to 20 evidence examples and 12 locations are initially selected, then trimmed if needed.
  Mandatory metrics/coverage remain intact. No alternate unrestricted retrieval or generated SQL exists.
- Source text and user/history messages stay untrusted user-role data, not system instructions.
  A private SHA-256 provenance digest covers currently authorized rows, coverage, scope, filters and
  methodology. Previous complete exchanges are included only when their succeeded Copilot audit
  matches this digest and the current owner, organization and session. Changed access/data, unproven
  foundation exchanges and missing provenance exclude old exchanges from model context, without
  deleting the user's stored conversation. Old answers are never current evidence.
- The provider must return structured interpretation, advisory advice, limitations, metric keys
  and evidence keys. Server validation rejects malformed, duplicate, forged, knowledge-library or
  omitted-context citations. Labels come from supplied records; selected numerical observations are
  rendered from canonical metrics rather than recalculated by the model. Server scope/source caveats
  are appended even when omitted by the model. Citation membership does **not** prove every narrative
  claim is correct or guarantee immunity to prompt injection; human review remains required.
- Private audit rows retain feature/version/session linkage, supplied evidence IDs, digest, scope,
  methodology, timestamp, truncation and validated citation IDs, never raw operational bodies.
  The service-role client is used only for private audit provenance and session completion, not
  operational reads. Retrieval/provenance/audit failures stop before generation. Invalid generation,
  timeouts and provider failures complete the reserved turn as failed, with no persisted assistant
  answer, canned fallback or authoritative record changes.

Focused mock checks (no paid calls):

```powershell
npx --yes deno test --no-lock --config supabase\functions\deno.json supabase\functions\ai-service supabase\functions\safety-intelligence\retrieval_test.ts
npx --yes deno test --no-lock --allow-read --sloppy-imports --config supabase\functions\deno.json scripts\test-safety-copilot.ts
npm run build
```

Hosted deployment/lifecycle verification is tracked in the Batch 9 checkpoint below.
Existing snapshot panels,
incident closure/delegation and organization-specific user search remain unchanged.

### Private assistant conversation interface (Batch 10)

[SafetyAssistant](src/features/ai/SafetyAssistant.tsx) replaces the shell placeholder with a
responsive conversation panel: private recent-session list/reopening, New Chat, user/advisory
assistant bubbles, composer, send/loading states, safe text rendering and structured error traces.
The welcome message limits claims to authorized operational records and explicitly excludes
procedure, regulatory, inspection and audit knowledge libraries.

- New Chat creates a distinct server session. A first question also creates a session if none is
  selected. Follow-ups reuse its ID through `sendSafetyCopilotMessage`; no stateless foundation
  calls or automatic model calls are made on opening, refreshing or selecting a starter suggestion.
- Only the selected UUID is persisted in browser storage, keyed by organization/user. Message
  content remains in private server sessions, not local permanent memory. Selection restores on
  refresh; inaccessible/expired selections fail visibly. Storage failures warn that selection
  cannot survive refresh. TanStack Query history keys include owner/organization/session, with
  retries disabled and private cache removed when the panel unmounts or changes identity.
- Successful sends reload persisted messages rather than creating optimistic AI responses. Failed
  sends retain the question and show traceable errors. If generation succeeds but history refresh
  fails, the composer clears and warns to reopen rather than generating a duplicate answer.
- A synchronous local lock prevents overlapping sends/session switches; the existing server lock
  remains authoritative across tabs. Pending requests block new sends during the two-minute lock.
  Older abandoned pending turns can recover through the existing server mechanism. Expired sessions
  and message limits request a new chat; no permanent or unrestricted model memory is introduced.
- The session list shows up to 50 recent chats. Starter buttons only populate the composer; location
  suggestions use the current successful authorized snapshot, or generic wording when absent.
  Users may enter arbitrary questions up to 4,000 characters. Plain text is escaped, never treated
  as executable HTML. Rich evidence/citation presentation remains Batch 11.

Batch 9's remaining live-provider blocker is tracked below. This frontend
remains local and displays real service failures; it does not fabricate working chat responses.
No paid provider calls or hosted changes occurred during Batch 10.

```powershell
npx --yes deno test --no-lock --allow-read --sloppy-imports --config supabase\functions\deno.json scripts\test-assistant-conversation.ts scripts\test-safety-copilot.ts
node scripts\test-assistant-ui.mjs
node scripts\test-safety-intelligence-shell.mjs
npm run build
```

### Hosted deployment and lifecycle checkpoint (Batch 9)

On 2026-10-06, explicit approval covered the existing hosted project, limited pilot use and
at most two live OpenAI verification requests. The user privately configured `OPENAI_API_KEY`
and `OPENAI_MODEL`; the attempted request audit identifies `gpt-4.1-mini`.

- Applied only `202610050002` (audit), `202610050003` (sessions), `202610060002` (usage/lifecycle)
  and `202610060003` (cleanup scheduler). Each source SQL and its history entry were applied in
  one atomic transaction; existing remote history was preserved. The unrelated profile-edit
  migration was not deployed.
- Deployed only `ai-service` with the existing import map and JWT verification enabled.
  Hosted OPTIONS returned 200; anonymous POST returned 401. Frontend publication remains local.
- [Usage reservation](supabase/migrations/202610060002_ai_usage_lifecycle.sql) atomically serializes
  provider attempts per organization: 10 per user/organization/day and 100 per organization/day,
  resetting at 00:00 UTC. Provider failures count; no automatic retries exist. Failed quota checks
  stop before provider I/O. These are request caps, not a guaranteed dollar-spending ceiling.
  The approved $5 OpenAI budget alert must be configured/confirmed separately; alerts are not hard caps.
- `sentinel-ai-lifecycle-cleanup` is active at `0 3 * * *` (03:00 UTC/GMT), deleting expired
  30-day conversations and their cascading messages. Audits are retained for 365 days; any still
  referenced by messages are protected. Client roles cannot reserve attempts or run cleanup.
  Scheduler configuration is verified; observation of the next scheduled execution remains pending.
- Hosted rollback assertions passed: 24 audit, 26 session and 12 usage/lifecycle assertions.
  The CLI test runner's temporary-role schema permissions prevented its first attempt; strict
  `finish(true)` assertions were run through the authorized management connection, with fixture
  changes rolled back. Session tests now scope privileged fixture queries to avoid existing chats.
  Local quota tests cover exact 10/100 boundaries, failure counting, UTC reset and retention.
- The first authenticated UI request reached the real provider but returned HTTP 429.
  Its audit was `failed` / `provider_rate_limited`, linked to the selected private session,
  `safety-copilot-grounded-v1`, `safety-intelligence-v1` and 11 supplied evidence IDs.
  Only a failed user message persisted; no assistant response was fabricated and the session
  completion path released its lock. No second provider request was made.
- Incident integrity before/after this request matched: 1,009 records and identical full-row
  fingerprint. No authoritative incident records were modified by the AI checks.

After the user added API credits, the remaining approved live attempt succeeded on 2026-10-06:
OpenAI returned HTTP 200 using `gpt-4.1-mini`. Request
`407d9b93-9d09-45b1-bf94-5bc1326aadc6` used `safety-copilot-grounded-v1`, 11 supplied
evidence IDs and one server-validated incident citation, with the correct private session/audit
linkage. Canonical output showed 34 high-risk reports, 27 still open, and a Medium index of
41.42857142857143 from 77 classified reports. Both user and assistant messages persisted as
succeeded; browser reload restored the selected conversation and saved answer without generation.
Incident count (1,009) and full-row fingerprint remained identical before/after the retry.

The zero-credit provider blocker is resolved. Both initial approved live attempts were used.
The user then approved one additional paid follow-up, which succeeded with HTTP 200:
`29ce12f2-30a9-4b83-9019-88f897d549de`. The same session and authorized provenance digest
were retained. The answer correctly recalled INC-2026-000604 at the Gas Compression Unit and
reused current canonical counts (34 high-risk, 27 open), with the same validated incident citation.
The follow-up exchange appeared in persisted UI history; all 1,009 incidents and their full-row
fingerprint remained unchanged. The user confirmed the $5 monthly OpenAI budget alert is configured;
this is user confirmation, not an independent provider-settings inspection, and is not a hard cap.

**Remaining readiness check:** observation of the next scheduled cleanup execution. The active
03:00 UTC job still had no execution history as of 2026-10-06 14:48 UTC; its next scheduled run
is 2026-10-07 03:00 UTC (04:00 Nigeria time). Cleanup behavior already passed hosted rollback tests,
but that does not prove scheduler execution. No further paid verification calls are authorized
automatically. No secrets are recorded here.

### Answer evidence and transparency (Batch 11)

[AnswerEvidence](src/features/ai/AnswerEvidence.tsx) presents saved source citations, answer UTC
timestamp, authorized scope and methodology. New answers have separate observed canonical facts,
AI interpretation, advisory recommendations and coverage/limitations sections. Risk indices are
explicitly deterministic, not trained ML. JSON observations are validated against the shared metric
contracts; common risk/count/category fields are formatted for readability.

- The approved [evidence migration](supabase/migrations/202610060004_ai_message_evidence.sql)
  adds structured presentation to private conversation messages and preserves it atomically with
  session completion. It expires/cascades with chat content, not the 365-day audit retention.
  Audit records continue to contain provenance and validated IDs, not generated answer bodies.
- An owner/organization/permission/expiry-checked RPC exposes only succeeded Copilot evidence
  IDs, timestamp, visibility, methodology and saved message presentation. Private audit tables,
  digests, other requests and historical source titles are not exposed by that projection.
- [Fresh source resolution](src/features/ai/aiEvidenceService.ts) uses only the caller's client/RLS,
  organization predicates and validated operational UUIDs. Actions, investigations, causes, findings
  and closures need independent source access and readable incident parents; causes/findings also
  require readable investigation parents. Source dates are explicitly the incident reporting date,
  not an invented action/finding timestamp.
- Links open the supporting incident through its existing permission-checked detail route.
  Current titles/dates are shown only after successful access checks; inaccessible or deleted records
  have no source title/link metadata. Query failures and refreshes hide cached source details.
  Reopening, window focus and incident-update events recheck access; user/org/request-scoped source
  caches are removed when the panel changes identity/unmounts. This is not instantaneous revocation
  notification between checks; the detail route/database always enforce current access again.
- Historical conversation text remains private user history, not current authorized source details.
  At Batch 11, existing answers retained their original text and validated audit citation IDs. No retrospective
  structured facts/citations are fabricated by parsing legacy narrative. New structured sections
  apply to future generations. Batch 12 supersedes reopening behavior: old Copilot conversations
  without a complete current-access proof are hidden, not parsed or backfilled speculatively.
- Knowledge-document IDs, malformed identifiers and model-generated URLs are not supported sources.
  Citation membership validation does not prove narrative correctness; advice remains subject to review.

With explicit approval, only migration `202610060004` and the updated `ai-service` were deployed.
Hosted rollback assertions verified owner-only access, revoked permissions, expiry, metadata
projection/persistence and deletion retention. Browser reopening of the existing live conversation
displayed its validated incident link, current title/reporting date, snapshot scope and methodology.
No new paid provider requests, frontend publication or official record edits occurred.
Batch 9 still awaits observation of the next scheduled cleanup run.

```powershell
npx --yes deno test --no-lock --allow-read --sloppy-imports --config supabase\functions\deno.json scripts\test-ai-evidence.ts scripts\test-assistant-conversation.ts scripts\test-safety-copilot.ts
node scripts\test-assistant-ui.mjs
npx supabase test db supabase\tests\ai_message_evidence.sql supabase\tests\ai_sessions.sql --local
```

### Phase 2 security verification (Batch 12)

A dedicated security review identified one medium-severity gap: private transcripts could repeat
operational facts after the owner lost record visibility while retaining AI permission. Fresh citation
link checks did not protect the stored narrative or aggregate facts. The user approved the fix and
conservative hiding of older Copilot conversations that lack a full access proof.

[The saved-access migration](supabase/migrations/202610060005_ai_saved_access.sql) adds:

- Private, chat-retained access proofs captured under the trusted reserved request, with a signature
  of membership role, custom-role activity/grants/scope and closure delegation. Successful grounded
  turns must provide all eight authorized dataset ID lists, not just bounded model examples/citations.
  IDs are never sent to the model, browser or long-lived audit as this access footprint.
- Database-enforced session/transcript access using the existing authoritative incident, corrective
  action and investigation visibility helpers plus independent parent access. Any represented record
  becoming inaccessible/deleted, or an authorization signature change, denies the entire conversation.
  No client-side-only gate, service-role operational retrieval or second RBAC architecture is introduced.
- The same gate for evidence projection and turn reservation; direct table/API reads cannot bypass it.
  Legacy grounded replies without proof fail closed. Chats are retained until normal deletion/expiry;
  restoring full authorization can restore proven chats. An owner-only deletion RPC permits deletion
  even when SELECT access to the transcript is denied. Proofs cascade with chat deletion/expiry.
- A caller-token check immediately before delivery. If access changed during generation, no answer
  is returned. Generation remains correctly audited as succeeded; a separate `delivery_access_check`
  records allowed/denied/unavailable. Delivery/audit failures are explicit and never rewrite a completed
  turn as failed or suggest a fabricated fallback answer.
- Window focus, explicit refresh and incident-update events reload the private transcript, clearing
  prior content before access checks. Denied sends or post-send read failures clear saved UI content.
  Checks are not continuous revocation notifications and cannot erase text a user already read/copied.

**Security verification:** real PostgreSQL `authenticated`, `anon` and `service_role` roles exercise
cross-organization/user denial, direct transcript/metadata protection, role downgrade retaining AI
permission, custom-role grant/scope edits, same-role action-assignment revocation, private proof
permissions, legacy denial, owner deletion, expiry, audit retention, quota enforcement and existing
site-filter/RLS parent intersections. Focused provider mocks exercise forged identity/scope, caller-only
retrieval, same-session bounded provenance, injection-as-data, unsupported/fabricated citations,
structured output validation, unavailable reads/audits/quotas/providers, timeout and late delivery
revocation/audit failures. No real provider calls are needed.

All 113 rollback-only database assertions pass locally and hosted; all 46 focused mock/lifecycle
tests pass. The build, types, targeted lint and assistant/intelligence rendering regressions pass.
Bundled JavaScript contains no OpenAI/server-service credential markers; this static check complements,
not replaces, server architecture review. No AI write tools, arbitrary SQL, official record edits,
new dependencies or frontend publication were added.

**Deployment checkpoint:** with explicit approval, only migration `202610060005` and the updated
`ai-service` were deployed to the existing hosted project. Migration SQL/history were applied
atomically; unrelated pending migrations and existing history were left untouched. Hosted OPTIONS
returned 200 and anonymous POST returned 401. Hosted rollback tests left no fixture users/sessions.
Browser verification hid the previously selected unproven legacy transcript and its links with an
explicit access error; New Chat and refresh continuity still work without an AI request.
All 1,009 official incident rows retained the same full-row fingerprint before/after verification.
No paid provider requests occurred during this batch; frontend publication remains local.
The previously approved Batch 9 cron still awaits observation of its first scheduled cleanup execution.

**Remaining risks:** model text is untrusted advisory interpretation; structured validation and exact
citation membership do not establish semantic truth or eliminate prompt injection. Approved site
filters narrow current RLS visibility; the platform does not enforce per-user site assignments.
Access proofs bound IDs (10,000 per source) but large histories can make access checks more expensive;
do not silently relax checks on failure. The $5 provider budget is a user-confirmed soft alert, not a
hard dollar ceiling; daily attempt limits remain the enforced provider-use control.

```powershell
npx --yes deno test --no-lock --allow-read --sloppy-imports --config supabase\functions\deno.json supabase\functions\ai-service supabase\functions\safety-intelligence\retrieval_test.ts scripts\test-ai-evidence.ts scripts\test-assistant-conversation.ts scripts\test-safety-copilot.ts
npx supabase test db supabase\tests\ai_saved_access.sql supabase\tests\ai_sessions.sql supabase\tests\ai_message_evidence.sql supabase\tests\ai_request_audit.sql supabase\tests\ai_usage_lifecycle.sql supabase\tests\safety_intelligence.sql --local
node scripts\test-assistant-ui.mjs
node scripts\test-safety-intelligence-shell.mjs
npm run build
```

### Screenshot-inspired Safety Intelligence interface

The local interface now uses compact six-card intelligence summaries, paired ranked-location and
advisory-recommendation panels, and a facility planning table. Calculation details, source examples,
recommendation drivers and coverage notices remain available in expandable disclosures rather than
being removed. All displayed figures still come from the existing authorized canonical snapshot.

The assistant has a spacious independently scrolling conversation, clear advisory bubbles, a
bottom composer/send action, and a right-hand suggested-prompt panel with a collapsible private
conversation list. Five suggestions only populate/focus the composer; facility names come from
authorized data and no paid call runs until Send. The layout stacks on mobile, supports both themes,
keyboard focus and reduced motion, and retains existing expiry, access-proof and source-link checks.
Screenshot claims about document/regulatory knowledge, hourly model refresh and confidence are not
copied because those capabilities do not exist.

The [priority outlook selector](src/features/safety-intelligence/safetyPlanningView.ts) is a presentation
filter, not a new risk model. A location qualifies through an existing High indicator/observed High
priority, open High backlog, or known overdue unfinished actions. Incomplete/sparse history remains
explicit even when urgent drivers qualify. Recent High/Critical reporting alone without urgent
backlog does not qualify this focused view. Facilities are preferred, with the existing site fallback
when no facility cohort exists.

Show six qualifying locations initially; Show more includes every additional authorized qualifying
location, not just another fixed slice. Ordering uses open Critical backlog, overdue Critical-linked
actions, open High backlog, overdue actions, recent High/Critical counts, name and ID. The unchanged
top-three reporting-window panel remains separate from this 90-day/14-day planning outlook.
Omitted locations are not declared safe, and incomplete retrieval is not treated as complete coverage.

Render tests cover filtering, sparse urgent history, overdue-only drivers, ordering/ties and
six-row/all-row expansion. Browser checks verified six of 30 real qualifying facilities, expansion
to all 30 and collapse, prompt selection without sending, desktop two-column conversation/tools,
mobile single-column cards/chat, and local table scrolling without page overflow.
No backend methodology, migration/deployment, paid provider calls or official record changes occur
as part of this visual update.

## Phase 1 AI foundation

The reusable AI endpoint is [ai-service](supabase/functions/ai-service/index.ts).
Its generic foundation mode has no operational retrieval. The opt-in Batch 8 Copilot mode above
adds authorized grounding, but neither mode has RAG, trained predictions or record-writing tools.
The browser helper [aiService.ts](src/features/ai/aiService.ts) forwards the existing Supabase session;
OpenAI requests run only in the Edge Function.

Configure `OPENAI_API_KEY` and `OPENAI_MODEL` in the approved project's **Edge Function secrets**,
not as `VITE_*` variables or in browser code. Supabase supplies `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions.
The service-role client is limited to audit/session infrastructure; profile, membership,
custom-role and operational reads use the caller token and existing RLS.
Built-in AI permission grants match the existing role map.

Before deployment, apply [the AI audit migration](supabase/migrations/202610050002_ai_request_audit.sql)
to the approved environment. Without its table or server configuration, requests fail safely.
Audit records contain trusted user/organization IDs, request IDs, feature/version/model identifiers,
statuses, generic failure codes, duration, token counts, and provider HTTP status where available.
The audit table does not persist prompts, generated answers, provider error bodies, or secrets.
Opt-in conversation history stores user/assistant content separately under private session RLS.
Requests rejected before a trusted tenant is established have a console trace only.
Database outages can leave pending audit rows; investigate these rather than assuming completion.

Instructions are versioned in [aiPrompts.ts](supabase/functions/_shared/aiPrompts.ts).
Retain published definitions and introduce a new version when instructions change.
The same selected definition supplies provider instructions and audit identifiers.
The shared [Zod response contract](supabase/functions/_shared/aiContracts.ts) labels generated
content as non-authoritative and reserves citations for future authorized retrieval.
Provider failures do not trigger automatic retries or canned answers.

With Docker running, local checks can be run from PowerShell:

```powershell
npx supabase start
npx supabase migration up --local
npx supabase test db supabase\tests\ai_request_audit.sql
npx supabase test db supabase\tests\ai_sessions.sql
npx --yes deno check supabase\functions\ai-service\index.ts
npx --yes deno test supabase\functions\ai-service
npx --yes deno lint supabase\functions\ai-service supabase\functions\_shared
npm run build
npm run lint
```

These local commands do not deploy to the hosted project. Do not reset an existing local
database just to run these checks. Production readiness additionally requires approved hosted
migration/function deployment, secret configuration, a live provider smoke test, tenant/RBAC
checks in that environment, and operational decisions on usage budgets, audit retention,
and pending-request monitoring. Local mocked provider tests do not verify provider credentials
or model compatibility.

### Conversation sessions (foundation only)

Apply [the conversation migration](supabase/migrations/202610050003_ai_conversation_sessions.sql)
after the audit migration. No assistant UI is implemented.
The client service offers `createAiSession` for New Chat, `listAiSessions`/`getAiSession`
for reopening, `sendAiSessionMessage` for follow-ups, and `deleteAiSession` for deletion.
Retain the returned session ID in the future UI's route/selection so refresh can reopen it.
The original stateless AI request remains available for non-conversation foundation consumers;
assistant consumers must use the session-aware helper for every turn.

Sessions are owned by one user in one organization. Creation derives identity from Supabase
Auth and the active profile/membership; IDs selected by clients never grant ownership.
RLS also checks AI permission for reads/deletion. Clients cannot write message history.
Each turn links to its audit request and completion persists messages/audit atomically.
Failed/pending exchanges are visible to their owner but excluded from model context.
A session row lock serializes overlapping turns; abandoned locks can be recovered after two minutes.

Approved limits: a fixed 30-day session lifetime, at most 100 stored messages, and the latest
10 completed exchanges within a 24,000-character model-context budget including the new prompt.
This is a character/message strategy, not exact token counting. No cross-session memory,
summarization, operational retrieval, or RAG is enabled.
Expired sessions cannot be read or continued. Before production, schedule a trusted database
cleanup such as `delete from public.ai_sessions where expires_at <= now();` daily; cascading
deletion removes messages while audits retain their session identifiers. This cleanup is not
scheduled automatically by the migration. Account/organization deletion also removes sessions.

## Master navigation

The authenticated workspace uses six permanent primary areas:

- Dashboard
- Report Incident
- Safety Intelligence
- Executive Analytics
- HSE Marketplace

User Profile, Notification Preferences, Activity Log, and User Management remain accessible as secondary account or administration destinations. Settings appears under ACCOUNT immediately after Administration, with its existing access checks unchanged. Future operational modules are not added as permanent sidebar items.

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

 1 establishes the common organization source of truth:

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

3 establishes the report/classify foundation for this lifecycle:

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

## deferred scope

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
