import { createClient } from '@supabase/supabase-js'
import { resolveSafetyScope, retrieveSafetyDataset } from '../_shared/safetyIntelligenceRetrieval.ts'
import { asOf, assert, dataset, equal, id, incident, org, site, user } from './fixtures_test.ts'
import { handleSafetyRequest, type SafetyRuntime } from './handler.ts'
import { safetyResponseSchema } from '../_shared/safetyIntelligenceContracts.ts'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}
const tableForSource = {
  incidents: 'incidents', actions: 'corrective_actions', investigations: 'investigations',
  causes: 'investigation_root_causes', findings: 'investigation_findings', closures: 'incident_closures',
  sites: 'sites', facilities: 'facilities',
}
type Scenario = {
  role?: string; delegated?: boolean; inactive?: boolean; invalidToken?: boolean;
  wrongMembership?: boolean; denyPermission?: boolean; malformed?: boolean; failedRead?: boolean;
  foreignRow?: boolean;
}
function fixtureFetch(data = dataset(), scenario: Scenario = {}, seen: URL[] = []): typeof fetch {
  return (input, init) => Promise.resolve().then(() => {
    const url = new URL(String(input instanceof Request ? input.url : input))
    seen.push(url)
    assert(!url.hostname.includes('openai'), 'Unexpected paid provider call')
    assert(new Headers(init?.headers).get('authorization') === 'Bearer test-token', 'Caller token was not forwarded')
    if (url.pathname.endsWith('/user')) return json(scenario.invalidToken ? { message: 'private-details' } : { id: user }, scenario.invalidToken ? 401 : 200)
    const table = url.pathname.split('/').at(-1)
    if (table === 'profiles') return json({ id: user, organization_id: org, account_status: scenario.inactive ? 'suspended' : 'active' })
    if (table === 'memberships') return json({
      user_id: scenario.wrongMembership ? id(999) : user, organization_id: org,
      role: scenario.role ?? 'Super Administrator',
    })
    if (table === 'custom_roles') return json({ permissions: scenario.denyPermission ? [] : ['use_ai_assistant'] })
    if (table === 'can_close_incidents') return json(scenario.delegated ?? false)
    const source = Object.entries(tableForSource).find(([, name]) => name === table)?.[0]
    if (!source) throw new Error(`Unexpected endpoint ${url.pathname}`)
    assert(url.searchParams.get('organization_id') === `eq.${org}`, 'Missing trusted tenant predicate')
    assert(!init?.method || init.method === 'GET', 'Operational retrieval attempted a write')
    if (scenario.failedRead) return json({ message: 'private-database-details' }, 500)
    if (scenario.malformed) return json([{ id: 'not-a-uuid' }])
    const key = source === 'closures' ? 'incident_id' : 'id'
    const list: unknown[] = data.rows[source as keyof typeof data.rows]
    const cursor = url.searchParams.get(key)?.replace('gt.', '')
    let records = list.map((row) => {
      const parsed = JSON.parse(JSON.stringify(row)) as Record<string, unknown>
      return scenario.foreignRow ? { ...parsed, organization_id: id(999) } : parsed
    }).filter((row) => !cursor || String(row[key]) > cursor)
    if (table === 'incidents') records = records.filter((row) => row.status !== 'draft')
    records.sort((a, b) => String(a[key]).localeCompare(String(b[key])))
    return json(records.slice(0, Number(url.searchParams.get('limit'))))
  })
}
function client(fetcher: typeof fetch) {
  return createClient('https://intelligence-test.invalid', 'test-anon', {
    global: { headers: { Authorization: 'Bearer test-token' }, fetch: fetcher },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

Deno.test('keyset pagination detects exact-cap completeness and truncation without offset skips', async () => {
  const seen: URL[] = []
  const data = dataset([incident(0), incident(1), incident(2), incident(3)])
  const caller = client(fixtureFetch(data, {}, seen))
  const context = { organizationId: org, userId: user, role: 'Super Administrator' }
  const complete = await retrieveSafetyDataset(caller, context, { days: 90 }, { pageSize: 2, maxRows: 4 })
  equal(complete.rows.incidents.length, 4)
  assert(complete.coverage.every((row) => row.complete), 'Exact-cap result marked incomplete')
  assert(seen.some((url) => url.searchParams.get('id')?.startsWith('gt.')), 'No stable cursor used')
  assert(seen.every((url) => !url.searchParams.has('offset')), 'Offset pagination used')
  const partial = await retrieveSafetyDataset(caller, context, { days: 90 }, { pageSize: 2, maxRows: 3 })
  equal(partial.rows.incidents.length, 3)
  assert(!partial.coverage.find((row) => row.source === 'incidents')?.complete, 'Cap silently reported complete')
})

Deno.test('site filters narrow real visibility; child sources require both parent and own access', async () => {
  const data = dataset([incident(0), incident(1, { site_id: id(99), facility_id: null })])
  data.rows.actions = [
    { id: id(300), organization_id: org, incident_id: incident(0).id, title: 'Visible action', status: 'open', due_date: null },
    { id: id(301), organization_id: org, incident_id: id(999), title: 'Assigned but hidden parent', status: 'open', due_date: null },
    { id: id(302), organization_id: org, incident_id: incident(1).id, title: 'Other site', status: 'open', due_date: null },
  ]
  data.rows.investigations = [
    { id: id(400), organization_id: org, incident_id: incident(0).id, status: 'completed', completed_at: null, findings_summary: null },
    { id: id(401), organization_id: org, incident_id: id(999), status: 'completed', completed_at: null, findings_summary: 'Hidden parent findings' },
  ]
  data.rows.causes = [
    { id: id(500), organization_id: org, investigation_id: id(400), root_cause_statement: 'Visible recorded cause', cause_category: null },
    { id: id(501), organization_id: org, investigation_id: id(401), root_cause_statement: 'Hidden parent cause', cause_category: null },
  ]
  const caller = client(fixtureFetch(data))
  const context = { organizationId: org, userId: user, role: 'Field Worker' }
  const result = await retrieveSafetyDataset(caller, context, { days: 90, siteId: site })
  equal(result.rows.incidents.length, 1)
  equal(result.rows.actions.map((row) => row.title), ['Visible action'])
  equal(result.rows.causes.map((row) => row.root_cause_statement), ['Visible recorded cause'])
  assert(result.coverage.every((row) => row.access === 'caller_visible'), 'Personal reads mislabeled organization coverage')
  equal((await resolveSafetyScope(caller, context, { days: 90 })).visibility, 'personal')
  equal((await resolveSafetyScope(client(fixtureFetch(data, { delegated: true })), context, { days: 90 })).visibility, 'organization')
})

Deno.test('authenticated snapshot endpoint rejects overrides, auth/role failures and malformed sources safely', async () => {
  const scenarios = [
    { name: 'success', status: 200, body: {}, scenario: {} },
    { name: 'personal', status: 200, body: {}, scenario: { role: 'Field Worker' } },
    { name: 'custom permission', status: 200, body: {}, scenario: { role: 'Custom analyst' } },
    { name: 'inactive', status: 403, body: {}, scenario: { inactive: true } },
    { name: 'bad token', status: 401, body: {}, scenario: { invalidToken: true } },
    { name: 'wrong identity', status: 403, body: {}, scenario: { wrongMembership: true } },
    { name: 'custom permission denied', status: 403, body: {}, scenario: { role: 'Custom analyst', denyPermission: true } },
    { name: 'client tenant override', status: 400, body: { organizationId: id(999) }, scenario: {} },
    { name: 'client scope override', status: 400, body: { visibility: 'organization' }, scenario: {} },
    { name: 'bad window', status: 400, body: { days: 31 }, scenario: {} },
    { name: 'malformed data', status: 503, body: {}, scenario: { malformed: true } },
    { name: 'database failure', status: 503, body: {}, scenario: { failedRead: true } },
    { name: 'foreign tenant data', status: 503, body: {}, scenario: { foreignRow: true } },
  ] satisfies Array<{ name: string; status: number; body: unknown; scenario: Scenario }>
  for (const item of scenarios) {
    const seen: URL[] = []
    const runtime: SafetyRuntime = {
      env: (name) => name === 'SUPABASE_URL' ? 'https://intelligence-test.invalid' : 'test-anon',
      now: () => asOf, fetch: fixtureFetch(dataset([incident(0)]), item.scenario, seen),
    }
    const response = await handleSafetyRequest(new Request('https://test.invalid', {
      method: 'POST', headers: { Authorization: 'Bearer test-token' }, body: JSON.stringify(item.body),
    }), runtime)
    equal(response.status, item.status)
    const text = await response.text()
    assert(!text.includes('private-'), `${item.name} exposed internal details`)
    const parsed = safetyResponseSchema.parse(JSON.parse(text))
    if (parsed.ok) {
      equal(parsed.snapshot.scope.userId, user)
      equal(parsed.snapshot.scope.visibility, item.scenario.role === 'Super Administrator' || !item.scenario.role ? 'organization' : 'personal')
      assert(parsed.snapshot.origin === 'deterministic' && !parsed.snapshot.authoritative, 'Misleading origin')
    } else {
      assert(parsed.requestId.length > 0, 'No failure trace')
      if (item.status === 400 || item.status === 401 || item.status === 403) {
        assert(!seen.some((url) => url.pathname.endsWith('/incidents')), 'Rejected caller reached operational data')
      }
    }
  }
})

Deno.test('snapshot handles missing auth/config, malformed JSON and unexpected errors without provider fallback', async () => {
  const request = (authorization?: string, body = '{}') => new Request('https://test.invalid', {
    method: 'POST', headers: authorization ? { Authorization: authorization } : {}, body,
  })
  const runtime: SafetyRuntime = { env: () => undefined, now: () => asOf, fetch: () => { throw new Error('Unexpected network call') } }
  equal((await handleSafetyRequest(request(), runtime)).status, 401)
  equal((await handleSafetyRequest(request('Bearer test-token'), runtime)).status, 503)
  runtime.env = () => { throw new Error('private-configuration') }
  const unexpected = await handleSafetyRequest(request('Bearer test-token'), runtime)
  equal(unexpected.status, 500)
  assert(!(await unexpected.text()).includes('private-configuration'), 'Raw error leaked')
  runtime.env = (name) => name === 'SUPABASE_URL' ? 'https://intelligence-test.invalid' : 'test-anon'
  runtime.fetch = fixtureFetch()
  equal((await handleSafetyRequest(request('Bearer test-token', 'broken json'), runtime)).status, 400)
  equal((await handleSafetyRequest(new Request('https://test.invalid'), runtime)).status, 405)
})

Deno.test('the request deadline survives Supabase wrapping an aborted operational read', async () => {
  const baseFetch = fixtureFetch()
  const runtime: SafetyRuntime = {
    env: (name) => name === 'SUPABASE_URL' ? 'https://intelligence-test.invalid' : 'test-anon',
    now: () => asOf, deadline: () => AbortSignal.timeout(20),
    fetch: (input, init) => {
      if (!String(input).includes('/incidents?')) return baseFetch(input, init)
      const signal = init?.signal
      assert(signal, 'No read deadline')
      return new Promise<Response>((_resolve, reject) => {
        const aborted = () => reject(new DOMException('private-timeout-details', 'AbortError'))
        if (signal.aborted) aborted()
        else signal.addEventListener('abort', aborted, { once: true })
      })
    },
  }
  const response = await handleSafetyRequest(new Request('https://test.invalid', {
    method: 'POST', headers: { Authorization: 'Bearer test-token' }, body: '{}',
  }), runtime)
  equal(response.status, 504)
  const body = safetyResponseSchema.parse(await response.json())
  assert(!body.ok && body.error.code === 'request_timeout', 'Timeout became a fake snapshot')
})
