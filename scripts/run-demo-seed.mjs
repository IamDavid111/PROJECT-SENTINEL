import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { Client as PostgresClient } from 'pg'

const incidentCount = 1200
const draftCount = 15
const investigationCount = 960
const correctiveActionCount = 900

function parseArguments(args) {
  return {
    plan: args.includes('--plan'),
    dryRun: args.includes('--dry-run'),
    validateOnly: args.includes('--validate-only'),
    local: args.includes('--local'),
    confirmRemote: args.find((arg) => arg.startsWith('--confirm-remote='))?.split('=', 2)[1] || '',
  }
}

function databaseProjectRef(databaseUrl) {
  const parsed = new URL(databaseUrl)
  const directMatch = parsed.hostname.match(/^db\.([a-z0-9]{20})\.supabase\.co$/)
  if (directMatch) return directMatch[1]
  if (parsed.hostname.endsWith('.pooler.supabase.com')) {
    const username = decodeURIComponent(parsed.username)
    return username.match(/^postgres\.([a-z0-9]{20})$/)?.[1] || null
  }
  return null
}

function assertTargetSafety(databaseUrl, args) {
  const parsed = new URL(databaseUrl)
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('SUPABASE_DB_URL must use the PostgreSQL protocol.')
  }

  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
  if (isLocal) {
    if (!args.local) throw new Error('Local database access requires the explicit --local flag.')
    return
  }
  if (args.local) throw new Error('The --local flag cannot be used with a remote database URL.')

  const projectRef = databaseProjectRef(databaseUrl)
  const confirmedRef = process.env.DEMO_SUPABASE_PROJECT_REF
  if (
    !projectRef
    || !confirmedRef
    || projectRef !== confirmedRef
    || args.confirmRemote !== projectRef
  ) {
    throw new Error('Remote database access blocked: the DB project ref, DEMO_SUPABASE_PROJECT_REF, and --confirm-remote=<ref> must all match.')
  }
  if (!['require', 'verify-ca', 'verify-full'].includes(parsed.searchParams.get('sslmode') || '')) {
    throw new Error('Remote database access blocked: SUPABASE_DB_URL must specify sslmode=require or stricter verification.')
  }
}

async function run() {
  const args = parseArguments(process.argv.slice(2))
  if (args.plan) {
    console.log(JSON.stringify({
      organization: 'Sentinel Energy & Industrial Services Ltd',
      demoUsers: 20,
      incidents: incidentCount,
      drafts: draftCount,
      investigations: investigationCount,
      correctiveActions: correctiveActionCount,
      dateRange: ['2023-09-29', '2026-09-29'],
    }, null, 2))
    return
  }

  const sqlPath = path.resolve(
    args.validateOnly ? 'supabase/seed_validation.sql' : 'supabase/seed.sql',
  )
  const sql = await readFile(sqlPath, 'utf8')
  if (args.dryRun) {
    if (
      !sql.includes('SENTINEL-DEMO')
      || !sql.includes('DEMO-SEED:sentinelqhse-v1')
      || (!args.validateOnly && (!sql.startsWith('BEGIN;') || !sql.trimEnd().endsWith('COMMIT;')))
    ) {
      throw new Error('Demo seed static checks failed; no database connection was opened.')
    }
    console.log(JSON.stringify({
      dryRun: true,
      file: args.validateOnly ? 'supabase/seed_validation.sql' : 'supabase/seed.sql',
      incidents: args.validateOnly ? undefined : incidentCount,
      drafts: args.validateOnly ? undefined : draftCount,
      investigations: args.validateOnly ? undefined : investigationCount,
      correctiveActions: args.validateOnly ? undefined : correctiveActionCount,
      databaseConnectionOpened: false,
    }, null, 2))
    return
  }

  const databaseUrl = process.env.SUPABASE_DB_URL
  if (!databaseUrl) throw new Error('Set SUPABASE_DB_URL in the server-side terminal environment.')
  assertTargetSafety(databaseUrl, args)

  const client = new PostgresClient({ connectionString: databaseUrl })
  await client.connect()
  try {
    const result = await client.query(sql)
    if (args.validateOnly) {
      for (const resultSet of Array.isArray(result) ? result : [result]) {
        if (resultSet.rows?.length) console.table(resultSet.rows)
      }
    }
  } finally {
    await client.end()
  }

  console.log(args.validateOnly
    ? 'Read-only demo seed validation completed.'
    : 'Demo seed transaction committed.')
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Demo seed operation failed.')
  process.exitCode = 1
})
