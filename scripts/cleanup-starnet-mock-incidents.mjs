import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const previewSql = path.join(projectRoot, 'supabase', 'seed', 'preview_starnet_mock_incident_cleanup.sql')
const cleanupSql = path.join(projectRoot, 'supabase', 'seed', 'cleanup_starnet_mock_incidents.sql')
// Preview is the default; --execute proceeds only after the linked-project identity and mock-marker checks pass.
const execute = process.argv.includes('--execute')

function parseCliJson(text) {
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

function runQuery(sqlFile) {
  // The CLI targets whichever Supabase project is currently linked in this workspace.
  const command = `npm exec supabase -- db query --linked --output json --file "${sqlFile}"`
  const result = spawnSync(command, [], {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Supabase query failed')
  return parseCliJson(result.stdout)
}

const previewResponse = runQuery(previewSql)
const preview = previewResponse.rows?.[0]?.cleanup_preview
if (!preview) throw new Error('Cleanup preview query returned no preview data')
if (!preview.organization_verified) throw new Error('Cleanup stopped: the fixed StarNet Tech organization identity did not verify')
if (Number(preview.incidents_with_batch_prefix) > 1000) throw new Error('Cleanup stopped: more than 1,000 incidents match the fixed batch prefix')
if (Number(preview.incidents_missing_exact_mock_signature) !== 0) throw new Error('Cleanup stopped: prefixed incidents include rows without the exact mock signature')

console.log('Cleanup preview (no records have been removed):')
console.log(JSON.stringify(preview, null, 2))

if (!execute) {
  console.log('\nDry run only. To delete exactly these tagged incident records and their dependencies, rerun with --execute.')
  process.exit(0)
}

const cleanupResponse = runQuery(cleanupSql)
const cleanupResult = cleanupResponse.rows?.[0]?.cleanup_result
if (!cleanupResult) throw new Error('Cleanup SQL returned no final result')
if (Number(cleanupResult.remaining_tagged_incidents) !== 0) {
  throw new Error(`Cleanup transaction reported ${cleanupResult.remaining_tagged_incidents} tagged incidents remain`)
}
console.log('\nCleanup committed:')
console.log(JSON.stringify(cleanupResult, null, 2))
