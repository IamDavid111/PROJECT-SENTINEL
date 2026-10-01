# StarNet Mock Incident Data

## Batch identity and scope

- Organization: StarNet Tech (`SENT-23FKES`, organization ID `25ad3a5c-514b-4097-96a6-a712c715d92b`).
- Incident batch ID: `MOCK-STARNET-INCIDENTS-20260929`.
- Incident marker: `incidents.client_submission_id` starts with the batch ID plus a four-digit sequence; `digital_signature` is `MOCK:MOCK-STARNET-INCIDENTS-20260929`.
- Date range: 2023-09-29 through 2026-09-29 UTC, inclusive. Reports are generated before the 2026-09-30 UTC cutoff.
- Seeded incident count: 1,000. The batch uses the existing 20 tagged mock reporter accounts, configured departments, categories, severities, shifts, sites, and facilities.
- Evidence/attachments: none.

## Seed

1. Sign in to the app as an active StarNet Tech organization administrator.
2. Open Administration → User Management.
3. Select **Seed 1,000 mock incidents**.

The deployed Edge Function verifies the authenticated administrator and validates active Settings, sites, facilities, reporters, and all generated timestamps before calling the transactional database RPC. It filters inactive sites. The database transaction rejects partial batches and rolls back the whole insert on any failure.

Rerunning is safe: if all 1,000 tagged incidents already exist, the function returns existing counts and creates no duplicates. If only part of the batch exists, it refuses to add more. It does not alter existing non-mock incidents.

## Export

From the repository root, run:

```powershell
node scripts/export-starnet-mock-incidents.mjs
```

This reads the tagged records from the linked Supabase project and writes:

- `supabase/seed/data/incidents.json`
- `supabase/seed/data/incidents.csv`

The JSON includes the database incident columns and related reporter, site, facility, people, evidence, investigation content, corrective actions, and activity rows. The CSV includes the report fields intended for tabular review. The exporter verifies that each output contains 1,000 records before completing. Run it again to refresh the files from current database values.

## Cleanup

Preview first; preview is the default and removes nothing:

```powershell
node scripts/cleanup-starnet-mock-incidents.mjs
```

Review the organization identity and dependent-row counts. To delete the tagged incident batch and its linked records, explicitly run:

```powershell
node scripts/cleanup-starnet-mock-incidents.mjs --execute
```

The cleanup transaction removes only incidents in the fixed StarNet organization that match both the batch `client_submission_id` prefix and exact `digital_signature` marker. It deletes linked storage objects only when an `incident_evidence.storage_path` references that exact object in the `incident-evidence` bucket. Dependent people, evidence metadata, investigation findings/root causes/corrections, corrective actions, investigations, and incident-related activity logs are deleted before the incidents. The transaction is idempotent and verifies that no tagged incidents remain.

Cleanup intentionally preserves the organization, Settings, all site/facility rows, the separate mock reporter Auth accounts/profiles/memberships, and all incidents without both exact mock markers. It never disables RLS. The script uses the Supabase CLI's privileged linked database connection, so review the dry-run output and ensure the linked project is correct before passing `--execute`. Never run against another target project.

## Expected linked counts

Observed when this README was written (2026-09-30):

| Table / record type | Expected batch count |
|---|---:|
| Incidents | 1,000 |
| Incident people | 476 |
| Incident evidence rows | 0 |
| Investigations | 663 |
| Investigation findings | 373 |
| Investigation root causes | 398 |
| Investigation corrections | 220 |
| Corrective actions | 546 |
| Tagged submission activity rows | 1,000 |
| Total incident-related activity rows removed by cleanup | 1,717 |
| Referenced Storage objects | 0 |

The activity-log cleanup count includes submission plus investigation/action/verification/closure events; it is larger than the 1,000 explicitly batch-tagged submission rows. Counts can vary if authorized administrators add or remove related mock workflow records later. The cleanup script always previews the current exact counts before execution.

Incident status distribution: 208 submitted, 129 under review, 175 investigation, 230 corrective action, 100 pending verification, and 158 closed. Severity distribution: 388 Low, 290 Medium, 209 High, and 113 Critical. Potential root cause is populated on 498 incidents. There are 286 overdue nonterminal corrective actions. Closed incidents have completed investigations, root-cause records, and verified/closed actions. Mock reports have no evidence attachments.
