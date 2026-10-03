import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(projectRoot, 'supabase', 'seed', 'data')
// Export only this fixed tagged batch from the currently linked project; verified output replaces the tracked JSON and CSV snapshots.
const organizationId = '25ad3a5c-514b-4097-96a6-a712c715d92b'
const batchPrefix = 'MOCK-STARNET-INCIDENTS-20260929-'
const expectedCount = 1000

const query = `
select coalesce(jsonb_agg(exported.record order by exported.record->>'client_submission_id'), '[]'::jsonb) as records
from (
  select to_jsonb(i) || jsonb_build_object(
    'reporter', (
      select jsonb_build_object(
        'profile_id', p.id,
        'full_name', p.full_name,
        'email', u.email,
        'employee_id', p.employee_id,
        'department', p.department,
        'site_location', p.site_location,
        'job_title', p.job_title,
        'role', m.role
      )
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.memberships m on m.user_id = p.id and m.organization_id = p.organization_id
      where p.id = i.reported_by and p.organization_id = i.organization_id
    ),
    'site', (select to_jsonb(s) from public.sites s where s.id = i.site_id and s.organization_id = i.organization_id),
    'facility', (select to_jsonb(f) from public.facilities f where f.id = i.facility_id and f.organization_id = i.organization_id),
    'people', coalesce((
      select jsonb_agg(to_jsonb(ip) order by ip.created_at, ip.id)
      from public.incident_people ip
      where ip.incident_id = i.id and ip.organization_id = i.organization_id
    ), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
      from public.incident_evidence e
      where e.incident_id = i.id and e.organization_id = i.organization_id
    ), '[]'::jsonb),
    'investigations', coalesce((
      select jsonb_agg(
        to_jsonb(v) || jsonb_build_object(
          'findings', coalesce((select jsonb_agg(to_jsonb(finding) order by finding.created_at, finding.id) from public.investigation_findings finding where finding.investigation_id = v.id and finding.organization_id = v.organization_id), '[]'::jsonb),
          'root_causes', coalesce((select jsonb_agg(to_jsonb(root_cause) order by root_cause.created_at, root_cause.id) from public.investigation_root_causes root_cause where root_cause.investigation_id = v.id and root_cause.organization_id = v.organization_id), '[]'::jsonb),
          'corrections', coalesce((select jsonb_agg(to_jsonb(correction) order by correction.created_at, correction.id) from public.investigation_corrections correction where correction.investigation_id = v.id and correction.organization_id = v.organization_id), '[]'::jsonb)
        ) order by v.created_at, v.id
      )
      from public.investigations v
      where v.incident_id = i.id and v.organization_id = i.organization_id
    ), '[]'::jsonb),
    'corrective_actions', coalesce((
      select jsonb_agg(
        to_jsonb(a) || jsonb_build_object(
          'assigned_owner', (select jsonb_build_object('id', owner.id, 'full_name', owner.full_name, 'employee_id', owner.employee_id) from public.profiles owner where owner.id = a.assigned_owner_id and owner.organization_id = a.organization_id)
        ) order by a.created_at, a.id
      )
      from public.corrective_actions a
      where a.incident_id = i.id and a.organization_id = i.organization_id
    ), '[]'::jsonb),
    'activity_logs', coalesce((
      select jsonb_agg(to_jsonb(log_row) order by log_row.created_at, log_row.id)
      from public.activity_logs log_row
      where log_row.organization_id = i.organization_id
        and log_row.metadata->>'incident_id' = i.id::text
    ), '[]'::jsonb)
  ) as record
  from public.incidents i
  where i.organization_id = '${organizationId}'
    and i.client_submission_id like '${batchPrefix}%'
) exported;
`

function extractFirstJsonObject(text) {
  const start = text.indexOf('{')
  if (start < 0) throw new Error(`Supabase CLI returned no JSON object. Output: ${text.slice(0, 1000)}`)
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return JSON.parse(text.slice(start, index + 1))
    }
  }
  throw new Error('Supabase CLI JSON output was incomplete')
}

function csvValue(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function makeCsv(records) {
  const columns = [
    ['incident_id', (incident) => incident.id],
    ['reference_number', (incident) => incident.reference_number],
    ['reporter_name', (incident) => incident.reporter?.full_name],
    ['reporter_email', (incident) => incident.reporter?.email],
    ['department', (incident) => incident.department],
    ['site', (incident) => incident.site?.name],
    ['facility_area', (incident) => incident.facility?.name ?? incident.location],
    ['category', (incident) => incident.incident_category],
    ['severity', (incident) => incident.severity],
    ['shift', (incident) => incident.shift],
    ['weather', (incident) => incident.weather_conditions],
    ['equipment', (incident) => incident.equipment_involved],
    ['contractor', (incident) => incident.contractor_involved ? incident.contractor_organization : ''],
    ['incident_date', (incident) => incident.occurred_at],
    ['submitted_at', (incident) => incident.reported_at],
    ['status', (incident) => incident.status],
  ]
  const lines = [columns.map(([header]) => csvValue(header)).join(',')]
  for (const record of records) lines.push(columns.map(([, getValue]) => csvValue(getValue(record))).join(','))
  return `${lines.join('\r\n')}\r\n`
}

const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'starnet-mock-incident-export-'))
try {
  const sqlPath = path.join(temporaryDirectory, 'export.sql')
  writeFileSync(sqlPath, query, 'utf8')
  const command = `npm exec supabase -- db query --linked --output json --file "${sqlPath}"`
  const result = spawnSync(command, [], {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Supabase CLI export query failed')
  const response = extractFirstJsonObject(result.stdout)
  const records = response.rows?.[0]?.records
  if (!Array.isArray(records)) throw new Error('Query did not return a JSON array of incident records')
  if (records.length !== expectedCount) throw new Error(`Expected ${expectedCount} mock incidents, received ${records.length}`)
  if (records.some((record) => record.organization_id !== organizationId || !record.client_submission_id?.startsWith(batchPrefix))) {
    throw new Error('Export query returned a record outside the tagged StarNet mock batch')
  }

  mkdirSync(outputDirectory, { recursive: true })
  const jsonPath = path.join(outputDirectory, 'incidents.json')
  const csvPath = path.join(outputDirectory, 'incidents.csv')
  writeFileSync(jsonPath, `${JSON.stringify(records, null, 2)}\n`, 'utf8')
  writeFileSync(csvPath, makeCsv(records), 'utf8')

  const jsonCount = JSON.parse(readFileSync(jsonPath, 'utf8')).length
  const csvCount = readFileSync(csvPath, 'utf8').trimEnd().split(/\r?\n/).length - 1
  if (jsonCount !== expectedCount || csvCount !== expectedCount) throw new Error(`Export verification failed (JSON ${jsonCount}, CSV ${csvCount})`)
  console.log(JSON.stringify({ jsonPath, csvPath, jsonRecords: jsonCount, csvRecords: csvCount }, null, 2))
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
