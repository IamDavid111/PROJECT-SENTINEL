import { createClient } from '@supabase/supabase-js'
import { resolveAccessibleSources, getMessageEvidence } from '../src/features/ai/aiEvidenceService.ts'
import { getAiSession } from '../src/features/ai/aiService.ts'
import { assert, equal, id, org, user } from '../supabase/functions/safety-intelligence/fixtures_test.ts'

function fixture(options: { hiddenParent?: boolean; hiddenChild?: boolean; foreign?: boolean; fail?: boolean; noEvidence?: boolean } = {}) {
  const seen: string[] = []
  const fetcher: typeof fetch = (input, init) => Promise.resolve().then(() => {
    const url = new URL(String(input))
    const table = url.pathname.split('/').at(-1)
    seen.push(table ?? '')
    const filters = url.searchParams
    if (table === 'get_ai_session_evidence') {
      equal(JSON.parse(String(init?.body)), { p_session_id: id(800) })
      return new Response(JSON.stringify(options.noEvidence ? [] : [{
        request_id: id(900), sourceIds: [`incidents:${id(101)}`],
        asOf: '2026-10-06T12:00:00.000Z', methodology: 'safety-intelligence-v1', visibility: 'personal', presentation: null,
      }]), { headers: { 'Content-Type': 'application/json' } })
    }
    if (table === 'ai_sessions') return new Response(JSON.stringify({
      id: id(800), title: 'Private chat', created_at: '2026-10-06T12:00:00.000Z',
      updated_at: '2026-10-06T12:00:00.000Z', expires_at: '2026-11-05T12:00:00.000Z',
    }), { headers: { 'Content-Type': 'application/json' } })
    if (table === 'ai_session_messages') return new Response(JSON.stringify([{
      id: 1, request_id: id(900), role: 'assistant', content: 'Old answer', status: 'succeeded', created_at: '2026-10-06T12:00:00.000Z',
    }]), { headers: { 'Content-Type': 'application/json' } })
    equal(filters.get('organization_id'), `eq.${org}`)
    assert(!init?.method || init.method === 'GET', 'Source lookup attempted a write')
    const organization_id = options.foreign ? id(999) : org
    let rows: unknown[] = []
    if (table === 'incidents' && !options.hiddenParent) rows = [{
      id: id(101), organization_id, reference_number: 'REAL-1', title: 'Current title', reported_at: '2026-10-01T00:00:00Z',
    }]
    if (table === 'corrective_actions' && !options.hiddenChild) rows = [{ id: id(201), organization_id, incident_id: id(101) }]
    if (table === 'investigations' && !options.hiddenChild) rows = [{ id: id(301), organization_id, incident_id: id(101) }]
    if (table === 'investigation_root_causes' && !options.hiddenChild) rows = [{ id: id(401), organization_id, investigation_id: id(301) }]
    if (table === 'investigation_findings' && !options.hiddenChild) rows = [{ id: id(501), organization_id, investigation_id: id(301) }]
    if (table === 'incident_closures' && !options.hiddenChild) rows = [{ incident_id: id(101), organization_id }]
    return new Response(JSON.stringify(options.fail ? { message: 'Database unavailable' } : rows), {
      status: options.fail ? 500 : 200, headers: { 'Content-Type': 'application/json' },
    })
  })
  return { seen, client: createClient('https://evidence-test.invalid', 'test-anon', {
    global: { fetch: fetcher, headers: { Authorization: 'Bearer caller' } },
    auth: { persistSession: false, autoRefreshToken: false },
  }) }
}

const keys = [`incidents:${id(101)}`, `actions:${id(201)}`, `investigations:${id(301)}`,
  `causes:${id(401)}`, `findings:${id(501)}`, `closures:${id(101)}`]

Deno.test('all operational source types require fresh caller access and link to readable incident parents', async () => {
  const { client } = fixture()
  const result = await resolveAccessibleSources(client, org, keys)
  equal(result.length, 6)
  assert(result.every((source) => source.incidentId === id(101) && source.label === 'REAL-1 — Current title'), 'Incorrect current source details')
})

Deno.test('revoked child or parent access hides titles; failed/foreign reads fail closed', async () => {
  equal(await resolveAccessibleSources(fixture({ hiddenParent: true }).client, org, keys), [])
  const childrenHidden = await resolveAccessibleSources(fixture({ hiddenChild: true }).client, org, keys)
  equal(childrenHidden.map((source) => source.key), [keys[0]])
  for (const options of [{ foreign: true }, { fail: true }]) {
    let rejected = false
    try { await resolveAccessibleSources(fixture(options).client, org, keys) } catch { rejected = true }
    assert(rejected, 'Unsafe evidence read accepted')
  }
})

Deno.test('invalid UUIDs, unsupported document sources and forged URLs reject before any lookup', async () => {
  for (const key of ['incidents:not-a-uuid', `knowledge_document:${id(101)}`, 'https://forged.invalid', `incidents:${user}:extra`]) {
    const { client, seen } = fixture()
    let rejected = false
    try { await resolveAccessibleSources(client, org, [key]) } catch { rejected = true }
    assert(rejected && !seen.length, 'Invalid citation reached source retrieval')
  }
})

Deno.test('reopened messages retain only server evidence IDs; historical text never becomes a citation', async () => {
  const { client } = fixture()
  const reopened = await getAiSession(client, id(800))
  equal(reopened.messages[0].evidence?.sourceIds, [keys[0]])
  equal(reopened.messages[0].evidence?.presentation, null)
  const legacy = await getAiSession(fixture({ noEvidence: true }).client, id(800))
  equal(legacy.messages[0].evidence, undefined)
  equal((await getMessageEvidence(client, id(800))).length, 1)
})
