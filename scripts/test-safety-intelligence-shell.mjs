import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
// Execute the real invitation gate; a denied caller must never create a privileged client.
const invitationCode = ts.transpileModule(read('../supabase/functions/admin-invite-user/index.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
for (const [role, permissions, expectedStatus, expectedClients] of [
  ['Organization Administrator', ['view_executive_analytics'], 403, 1],
  ['Super Administrator', ['view_executive_analytics'], 409, 2],
  ['Organization Administrator', ['view_users'], 409, 2],
]) {
  let handler
  let clients = 0
  const createClient = () => {
    const privileged = ++clients > 1
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'requester', email: 'admin@example.com' } } }) },
      from: (table) => {
        const query = {
          select: () => query, eq: () => query, in: () => query,
          maybeSingle: async () => ({ data: privileged
            ? { id: 'existing-invitation', expires_at: '2099-01-01T00:00:00Z' }
            : table === 'memberships' ? { role } : { name: 'Analyst', permissions } }),
        }
        return query
      },
    }
  }
  runInNewContext(invitationCode, {
    exports: {}, require: () => ({ createClient }), Request, Response, Error,
    console: { error: () => {} },
    Deno: { env: { get: () => 'configured-test-value' }, serve: (callback) => { handler = callback } },
  })
  const response = await handler(new Request('https://test.invalid', {
    method: 'POST', headers: { Authorization: 'Bearer test-token' },
    body: JSON.stringify({ organizationId: 'organization', email: 'invitee@example.com', role: 'Analyst' }),
  }))
  assert.equal(response.status, expectedStatus)
  assert.equal(clients, expectedClients)
}
const app = read('../src/App.tsx')
const primary = app.split('const primaryNavigation:')[1].split('const secondaryNavigation:')[0]
const secondary = app.split('const secondaryNavigation:')[1].split('const futureModuleRoutes:')[0]
const labels = [...primary.matchAll(/label: '([^']+)'/g)].map((match) => match[1])
assert.deepEqual(labels, ['Dashboard', 'Report Incident', 'Safety Intelligence', 'Executive Analytics', 'HSE Marketplace'])
assert.match(primary, /route: 'ai-assistant', label: 'Safety Intelligence', icon: Sparkles, permission: 'use_ai_assistant'/)
assert(!primary.includes("label: 'QHSE Knowledge'"))
const accountLabels = [...secondary.matchAll(/label: '([^']+)'/g)].map((match) => match[1])
assert.equal(accountLabels[accountLabels.indexOf('Administration') + 1], 'Settings')
assert(!primary.includes("route: 'settings'"))
assert(secondary.includes("route: 'settings', label: 'Settings', permission: 'manage_settings'"))
assert(app.includes("const visibleSecondaryNavigation = secondaryNavigation.filter((item) => item.route === 'settings' ? canManageCompanySettings && canAccess(item.permission) : canAccess(item.permission))"))
assert(!secondary.includes("route: 'incidents'"))
assert(app.includes("requestedRoute === 'ai-assistant'") && app.includes("route === 'ai-assistant'"))
assert(app.includes("canManageCompanySettings && canAccess(item.permission)"))
assert(app.includes("{canAccess('view_executive_analytics') && <a"))
assert(app.includes("route === 'ai-assistant' && canAccess('use_ai_assistant')"))
assert(app.includes("route === 'executive-analytics' && <>"))
assert(app.includes("!canAccess('view_executive_analytics')"))
assert(app.includes("route !== 'executive-analytics' && !(route === 'incidents' && closureAccess.isPending) && !currentRouteAuthorized"))
const routeGuard = app.slice(app.indexOf("    if (!loading && route === 'settings'"),
  app.indexOf('  }, [canManageCompanySettings'))
for (const [route, expectedHash] of [['executive-analytics', '#executive-analytics'], ['users', '#dashboard']]) {
  const context = { loading: false, route, canManageCompanySettings: false, fallbackRoute: 'dashboard',
    closureAccess: { isPending: false }, currentRouteAuthorized: false, window: { location: { hash: `#${route}` } } }
  runInNewContext(`(() => { ${routeGuard} })()`, context)
  assert.equal(context.window.location.hash, expectedHash, 'Denied analytics must retain its denial route')
}
assert(app.includes('view="executive-analytics"'))
assert(app.includes('<WorkspacePlaceholder title="Executive Analytics"'))
assert(app.includes('action="Open Analytics Foundation"'))
assert(app.includes('className="workspace-placeholder-action" onClick={onAction} disabled={actionDisabled}'))
assert(app.includes("You do not have permission to view Executive Analytics. Please ask your Super Admin to grant you access."))
assert(app.includes('const [analyticsOpen, setAnalyticsOpen] = useState(false)'))
assert(app.includes('hidden={analyticsOpen && canAccess(\'view_executive_analytics\')}'))
assert(app.includes('hidden={!analyticsOpen}'))
assert(app.includes('() => setAnalyticsOpen(true)'))
assert(app.includes('onClick={() => setAnalyticsOpen(false)}'))
assert(app.includes('Back to Executive Analytics introduction'))
assert(app.includes('title="Executive Analytics" aria-label="Executive Analytics"'))
assert(app.includes("'Operations / Safety Intelligence'"))
assert(app.includes("'Operations / Executive Analytics'"))
assert(app.includes("route === 'knowledge' ? { label: 'QHSE Knowledge'"))
assert(app.includes("route === 'knowledge' && canAccess('view_knowledge_documents')"))

let query
let calls = 0
let days = 90
let activeTab = null
let requestedDays
let snapshotEnabled
let planningExpanded = false
let trendView = 'month'
let trendPeriod = 'reporting'
let requestedTrendDays
class TestServiceError extends Error { requestId = 'test-request-reference' }
// Render the real component with deterministic query states, without network or signed-in accounts.
function load(path) {
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const module = { exports: {} }
  runInNewContext(compiled, {
    exports: module.exports, module,
    require: (name) => {
      if (name === './useSafetyIntelligence') return { useSafetyIntelligence: (_client, _scope, filters, enabled) => {
        requestedDays = filters.days; requestedTrendDays = filters.trendDays; snapshotEnabled = enabled; return query
      } }
      if (name === './safetyIntelligenceService') return { SafetyIntelligenceError: TestServiceError }
      if (name === './ExecutiveAnalyticsExport') return { ExecutiveAnalyticsExport: () => createElement('button', null, 'Export Report') }
      if (name === '../ai/SafetyAssistant') return { SafetyAssistant: () => createElement('section', null,
        createElement('h2', null, 'AI Safety Assistant'), createElement('textarea', { 'aria-label': 'Your question' })) }
      if (name === '../knowledge/KnowledgePage') return { KnowledgePage: () => createElement('section', null,
        createElement('h2', null, 'QHSE Documents')) }
      if (name === 'react') return { ...require(name), useState: (initial) => typeof initial === 'boolean'
        ? [planningExpanded, (value) => { planningExpanded = typeof value === 'function' ? value(planningExpanded) : value }]
        : initial === 'month'
          ? [trendView, (value) => { trendView = value }]
        : initial === 'reporting'
          ? [trendPeriod, (value) => { trendPeriod = value }]
        : initial === null
          ? [activeTab, (value) => { activeTab = typeof value === 'function' ? value(activeTab) : value }]
          : [days, (value) => { days = value }],
        ...(path.endsWith('IncidentTrendChart.tsx') ? { useMemo: (calculate) => calculate(), useId: () => 'test-trend' } : {}),
      }
      if (name.startsWith('.')) {
        const target = resolve(dirname(path), name)
        return load(target.endsWith('.ts') ? target : existsSync(`${target}.ts`) ? `${target}.ts` : `${target}.tsx`)
      }
      return require(name)
    },
  })
  return module.exports
}
const root = fileURLToPath(new URL('../', import.meta.url))
// Exercise the actual route's open/back handlers and visibility without a signed-in browser.
const analyticsFlow = app.slice(app.indexOf("{route === 'executive-analytics' && <>"),
  app.indexOf("{route === 'marketplace' &&")).trim().slice(1, -1)
const flowContext = {
  exports: {}, require, route: 'executive-analytics', analyticsOpen: false,
  canAccess: () => true, closureAccess: { isPending: false, isError: false, data: true },
  WorkspacePlaceholder: () => null, SafetyIntelligencePage: () => null, ArrowLeft: () => null,
  supabase: {}, organizationId: 'test-org', session: { user: { id: 'test-user' } },
  role: 'Super Administrator', hasOrganizationIncidentVisibility: () => true,
  executiveAnalyticsAccessMessage: 'Access denied',
  setAnalyticsOpen: (value) => { flowContext.analyticsOpen = value },
}
runInNewContext(ts.transpileModule(`export function renderFlow() { return (${analyticsFlow}) }`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, flowContext)
let flow = flowContext.exports.renderFlow()
assert.equal(flow.props.children[0].props.hidden, false)
assert.equal(flow.props.children[1].props.hidden, true)
flow.props.children[0].props.children.props.onAction()
flow = flowContext.exports.renderFlow()
assert.equal(flow.props.children[0].props.hidden, true)
assert.equal(flow.props.children[1].props.hidden, false)
flow.props.children[1].props.children[0].props.onClick()
flow = flowContext.exports.renderFlow()
assert.equal(flow.props.children[0].props.hidden, false)
assert.equal(flow.props.children[1].props.hidden, true)
const permissions = load(resolve(root, 'src/data/userManagementConfig.ts'))
assert(permissions.hasPermission('Super Administrator', 'view_executive_analytics'))
for (const role of ['Organization Administrator', 'QHSE Manager', 'Site Supervisor',
  'Safety Officer / HSE Officer', 'Field Worker', 'Contractor', 'Maintenance Engineer',
  'Executive / Management', 'Auditor']) {
  assert(!permissions.hasPermission(role, 'view_executive_analytics'), `${role} received Executive Analytics by default`)
}
assert(permissions.hasPermission('Custom executive analyst', 'view_executive_analytics', ['view_executive_analytics']))
assert(!permissions.hasPermission('Custom executive analyst', 'view_executive_analytics', []))
const Page = load(resolve(root, 'src/features/safety-intelligence/SafetyIntelligencePage.tsx')).SafetyIntelligencePage
const { calculateSafetySnapshot } = load(resolve(root, 'supabase/functions/_shared/safetyIntelligenceCalculations.ts'))
const { dataset, scope, asOf, incident, org } = load(resolve(root, 'supabase/functions/safety-intelligence/fixtures_test.ts'))
const props = { client: {}, scope, canViewKnowledge: true }
const executiveProps = { ...props, view: 'executive-analytics', canExportAnalytics: true }
const data = calculateSafetySnapshot(dataset(), scope, { days: 90 }, asOf)
const render = (state, pageProps = props) => {
  query = { isPending: false, isError: false, isFetching: false, refetch: () => { calls++; return Promise.resolve() }, ...state }
  return renderToStaticMarkup(createElement(Page, pageProps))
}
activeTab = null
let html = render({ data })
assert.equal(snapshotEnabled, false, 'AI Assistant route requested Executive Analytics data')
assert(!html.includes('AI Safety Intelligence') && html.includes('AI Safety Assistant') && html.includes('QHSE Knowledge'))
assert(!html.includes('safety-intelligence-section') && !html.includes('QHSE Documents') && !html.includes('<textarea'))
html = render({ data }, executiveProps)
assert(html.includes('Export Report'))
assert(!render({ data }, { ...executiveProps, canExportAnalytics: false }).includes('Export Report'))
assert(!render({ data }, props).includes('Export Report'))
html = render({ data }, executiveProps)
assert.equal(snapshotEnabled, true, 'Executive Analytics did not enable its shared snapshot')
assert(html.includes('Executive Analytics') && html.includes('Safety Intelligence metrics'))
assert(!html.includes('AI Safety Assistant') && !html.includes('QHSE Knowledge'))
html = render({ isPending: true, isFetching: true }, executiveProps)
assert(html.includes('Loading authorized operational data') && html.includes('disabled=""'))
html = render({ isError: true, error: new TestServiceError('Service unavailable.'), data }, executiveProps)
assert(html.includes('role="alert"') && html.includes('test-request-reference'))
assert(!html.includes('Snapshot:') && !html.includes('Organization coverage'))
assert(!html.includes('Safety Intelligence metrics'), 'Cached cards appeared after failed access refresh')
assert(!html.includes('High-Risk Sites &amp; Recommendations'), 'Cached sites appeared after failed access refresh')
assert(!html.includes('14-Day Safety Planning Indicators'), 'Cached outlook appeared after failed access refresh')
html = render({ data }, executiveProps)
assert(html.includes('No authorized reported events') && html.includes('Organization coverage'))
html = render({ data: calculateSafetySnapshot(dataset(Array.from({ length: 12 }, (_, n) => incident(n))), { ...scope, visibility: 'personal' }, { days: 90 }, asOf) }, executiveProps)
assert(html.includes('My reports') && html.includes('Authorized operational data is connected'))
html = render({ data: { ...data, coverage: [{ source: 'incidents', complete: false }] } }, executiveProps)
assert(html.includes('retrieval is incomplete'))
assert(html.includes('Executive Analytics') && !html.includes('<textarea'))
assert(!html.includes('confidence'))
activeTab = 'assistant'
html = render({ data })
assert(html.includes('AI Safety Assistant') && html.includes('<textarea'))
assert(!html.includes('safety-intelligence-section') && !html.includes('QHSE Documents'))
activeTab = 'knowledge'
html = render({ data })
assert(html.includes('QHSE Documents') && !html.includes('safety-intelligence-section') && !html.includes('<textarea'))
html = renderToStaticMarkup(createElement(Page, { ...props, canViewKnowledge: false }))
assert(!html.includes('QHSE Knowledge') && !html.includes('QHSE Documents'))
activeTab = null
const tabButtons = []
const collectTabs = (node) => {
  if (!node || typeof node !== 'object') return
  if (node.type === 'button' && node.props['aria-pressed'] !== undefined) tabButtons.push(node)
  for (const child of [node.props?.children].flat(Infinity)) collectTabs(child)
}
collectTabs(Page(props))
tabButtons[0].props.onClick()
assert.equal(activeTab, 'assistant')
tabButtons[1].props.onClick()
assert.equal(activeTab, 'knowledge')
// Confirm Refresh is wired, not merely a button-shaped label.
const tree = Page(executiveProps)
const findRefresh = (node) => {
  if (!node || typeof node !== 'object') return
  if (node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('Refresh')) return node
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findRefresh(child)
    if (found) return found
  }
}
findRefresh(tree).props.onClick()
assert.equal(calls, 1)
assert.equal(days, 90)
assert.equal(requestedDays, 90)
const buttons = []
const collect = (node) => {
  if (!node || typeof node !== 'object') return
  if (node.type === 'button') buttons.push(node)
  for (const child of [node.props?.children].flat(Infinity)) collect(child)
}
collect(Page(executiveProps))
assert.deepEqual(buttons.filter((button) => ['30 days', '90 days', 'All Time'].includes(button.props.children)).map((button) => button.props.children),
  ['30 days', '90 days', 'All Time'])
buttons.find((button) => button.props.children === '30 days').props.onClick()
render({ data }, executiveProps)
assert.equal(days, 30)
assert.equal(requestedDays, 30)

const Trend = load(resolve(root, 'src/features/safety-intelligence/IncidentTrendChart.tsx')).IncidentTrendChart
const { incidentTrendViews } = load(resolve(root, 'src/features/safety-intelligence/incidentTrend.ts'))
const recharts = require('recharts')
const trendDataset = dataset([
  incident(0, { department: 'Fixture Department' }),
  incident(1, { report_type: 'near_miss', department: 'Fixture Department', status: 'closed' }),
])
trendDataset.rows.closures = [{
  incident_id: incident(1).id, organization_id: org, closed_at: '2026-10-04T12:00:00.000Z',
  root_cause: 'Fixture cause', corrective_action: 'Fixture action',
}]
const trendSnapshot = calculateSafetySnapshot(trendDataset, scope, { days: 90 }, asOf)
const descendants = (node) => !node || typeof node !== 'object' ? []
  : [node, ...[node.props?.children].flat(Infinity).flatMap(descendants)]
for (const option of incidentTrendViews) {
  const select = descendants(Trend({ snapshot: trendSnapshot })).find((node) => node.type === 'select')
  select.props.onChange({ target: { value: option.value } })
  const nodes = descendants(Trend({ snapshot: trendSnapshot }))
  const chart = nodes.find((node) => node.type === recharts.BarChart)
  assert(chart, `${option.label} did not render the grouped bar chart`)
  assert.equal(nodes.find((node) => node.type === 'select').props.value, option.value)
  assert.deepEqual(nodes.filter((node) => node.type === recharts.Bar).map((node) => node.props.name),
    ['Incidents', 'Near Misses', 'Closed'])
  const totals = chart.props.data.reduce((sum, point) =>
    [sum[0] + point.incidents, sum[1] + point.nearMisses, sum[2] + point.closed], [0, 0, 0])
  assert.deepEqual(totals, [1, 1, 1])
  assert(nodes.some((node) => node.type === recharts.Legend))
  assert.equal(nodes.find((node) => node.type === recharts.XAxis).props.label.value, option.axis)
  assert.equal(nodes.find((node) => node.type === recharts.YAxis).props.allowDecimals, false)
  assert.equal(nodes.find((node) => node.type === recharts.Tooltip).props.formatter(17), '17')
}
trendView = 'month'
html = render({ data: trendSnapshot }, executiveProps)
assert(html.indexOf('safety-kpi-grid') < html.indexOf('incident-trend-card'))
assert(html.indexOf('incident-trend-card') < html.indexOf('High-Risk Sites'))
assert(renderToStaticMarkup(createElement(Trend, { snapshot: data })).includes('No matching incident trend data'))
assert(renderToStaticMarkup(createElement(Trend, { snapshot: { ...data, incidentTrend: undefined } }))
  .includes('Incident trend unavailable'))
html = renderToStaticMarkup(createElement(Trend, {
  snapshot: { ...trendSnapshot, incidentTrend: { ...trendSnapshot.incidentTrend, complete: false, reasons: ['Incomplete fixture coverage'] } },
}))
assert(html.includes('Incomplete fixture coverage') && !html.includes('incident-trend-plot'))
console.log('PASS: chart placement, six selector handlers, three bar series, exact totals/tooltips, axes, legend and empty/unavailable/incomplete states')

let chosenPeriod
const periodTree = Trend({ snapshot: trendSnapshot, onPeriodChange: (period) => { chosenPeriod = period } })
const periodButtons = descendants(periodTree).filter((node) => node.type === 'button')
assert.deepEqual(periodButtons.map((node) => node.props.children), ['30 days', '90 days', 'All Time'])
periodButtons[2].props.onClick()
assert.equal(chosenPeriod, 'all')
const chartInPage = descendants(Page(executiveProps)).find((node) => node.type.name === 'IncidentTrendChart')
chartInPage.props.onPeriodChange('all')
render({ data }, executiveProps)
assert.equal(requestedDays, 'all', 'All Time did not change the KPI reporting period')
assert.equal(requestedTrendDays, 'all')
trendPeriod = 'reporting'

const Cards = load(resolve(root, 'src/features/safety-intelligence/SafetyKpiCards.tsx')).SafetyKpiCards
const events = dataset(Array.from({ length: 100 }, (_, n) => incident(n, {
  severity: n < 40 ? 'High' : 'Low', status: n < 20 || n >= 40 ? 'submitted' : 'closed',
})))
events.rows.closures.push({
  incident_id: incident(20).id, organization_id: org, closed_at: '2026-10-04T12:00:00.000Z',
  root_cause: 'Fixture cause', corrective_action: 'Fixture completed action',
})
const actual = calculateSafetySnapshot(events, scope, { days: 90 }, asOf)
const Outlook = load(resolve(root, 'src/features/safety-intelligence/SafetyPlanningOutlook.tsx')).SafetyPlanningOutlook
const outlookHtml = renderToStaticMarkup(createElement(Outlook, { snapshot: actual }))
assert(outlookHtml.includes('14-Day Safety Planning Indicators') && outlookHtml.includes('not a trained prediction'))
assert(outlookHtml.includes('Medium') && outlookHtml.includes('20 open High') && outlookHtml.includes('100 classified reports'))
assert(!outlookHtml.includes('confidence') && !outlookHtml.includes('probability'))
assert(renderToStaticMarkup(createElement(Outlook, { snapshot: data })).includes('Insufficient site history'))
const sparseOutlook = calculateSafetySnapshot(dataset([incident(0, { severity: 'Critical' })]), scope, { days: 90 }, asOf)
const sparseHtml = renderToStaticMarkup(createElement(Outlook, { snapshot: sparseOutlook }))
assert(sparseHtml.includes('Insufficient history') && sparseHtml.includes('Observed High priority—not a complete indicator'))
const many = structuredClone(actual)
const seedLocation = many.locations.find((item) => item.level === 'site')
many.locations = Array.from({ length: 9 }, (_, n) => ({ ...seedLocation,
  id: `ab000000-0000-4000-8000-${String(600 + n).padStart(12, '0')}`,
  name: `Priority site ${n + 1}`, backlogOpenCritical: 9 - n,
}))
let priorityHtml = renderToStaticMarkup(createElement(Outlook, { snapshot: many }))
assert.equal((priorityHtml.match(/<th scope="row">/g) ?? []).length, 6)
assert(priorityHtml.includes('Show 3 more priority sites') && !priorityHtml.includes('Priority site 7'))
const expandedTree = Outlook({ snapshot: many })
const expandButtons = []
const findExpand = (node) => {
  if (!node || typeof node !== 'object') return
  if (node.type === 'button') expandButtons.push(node)
  for (const child of [node.props?.children].flat(Infinity)) findExpand(child)
}
findExpand(expandedTree)
expandButtons[0].props.onClick()
priorityHtml = renderToStaticMarkup(createElement(Outlook, { snapshot: many }))
assert.equal((priorityHtml.match(/<th scope="row">/g) ?? []).length, 9)
assert(priorityHtml.includes('Show fewer sites') && priorityHtml.includes('Priority site 9'))
planningExpanded = false
const routine = structuredClone(actual)
routine.locations = routine.locations.map((item) => ({ ...item, backlogOpenCritical: 0, backlogOpenHigh: 0, overdueCriticalActions: 0, overdueActions: 0, recentHighRiskCount: 1 }))
const routineHtml = renderToStaticMarkup(createElement(Outlook, { snapshot: routine }))
assert(routineHtml.includes('No High indicator or qualifying urgent driver') && !routineHtml.includes('<th scope="row">'))
const { priorityPlanningLocations } = load(resolve(root, 'src/features/safety-intelligence/safetyPlanningView.ts'))
const { buildSafetyPlanningIndicators } = load(resolve(root, 'supabase/functions/_shared/safetyPlanningIndicators.ts'))
const priorities = priorityPlanningLocations(buildSafetyPlanningIndicators(many))
assert.equal(priorities.length, 9)
assert.equal(priorities[0].location.name, 'Priority site 1')
const tied = buildSafetyPlanningIndicators(many)
tied.locations = tied.locations.slice(0, 2).map((item) => ({ ...item, location: { ...item.location, backlogOpenCritical: 1, name: 'Same priority' } })).reverse()
assert.deepEqual(priorityPlanningLocations(tied).map((item) => item.location.id),
  [...tied.locations.map((item) => item.location.id)].sort())
const overdueOnly = structuredClone(routine)
overdueOnly.locations = overdueOnly.locations.filter((item) => item.level === 'site')
overdueOnly.locations[0].overdueActions = 1
assert.equal(priorityPlanningLocations(buildSafetyPlanningIndicators(overdueOnly)).length, 1)
const Locations = load(resolve(root, 'src/features/safety-intelligence/SafetyLocations.tsx')).SafetyLocations
const locationHtml = renderToStaticMarkup(createElement(Locations, { snapshot: actual }))
assert(locationHtml.includes('Deterministic guidance—not AI-generated') && locationHtml.includes('Advisory only'))
assert(locationHtml.includes('Fixture Site') && locationHtml.includes('20 open High'))
assert(locationHtml.includes(`#incident-detail?id=${incident(0).id}`))
assert(locationHtml.includes('authorized incident aggregate') && !locationHtml.includes('common cause:'))
assert(renderToStaticMarkup(createElement(Locations, { snapshot: data })).includes('No site-assigned High/Critical'))
const cards = (snapshot) => renderToStaticMarkup(createElement(Cards, { snapshot }))
html = cards(actual)
assert.equal((html.match(/<article/g) || []).length, 11)
for (const title of ['Total Incidents', 'Open Incidents', 'Closed Incidents',
  'Corrective Action On-Time Closure', 'Outstanding Actions']) {
  assert.equal(html.split(`<h3>${title}</h3>`).length - 1, 1, `Duplicated or missing ${title}`)
}
assert.match(html, /Total Incidents<\/h3><strong[^>]*>100<\/strong>/)
assert.match(html, /Open Incidents<\/h3><strong[^>]*>80<\/strong>/)
assert.match(html, /Closed Incidents<\/h3><strong[^>]*>20<\/strong>/)
assert.match(html, /Outstanding Actions<\/h3><strong[^>]*>0<\/strong>/)
assert.match(html, /Corrective Action On-Time Closure<\/h3><strong[^>]*>Unavailable<\/strong>/)
assert(html.includes('Completion and verification dates do not establish closure'))
const legacySnapshot = structuredClone(actual)
delete legacySnapshot.metrics.incidentCounts
delete legacySnapshot.metrics.outstandingActions
assert(cards(legacySnapshot).includes('deployed snapshot endpoint does not yet provide incident counts'))
for (const expected of ['34 / 100', 'Medium', 'safety-risk-medium', '20 still open', 'Equipment', '100%', 'Fixture Site', '100 total incidents', '2 days', '1 valid closures', 'Historical open-state observations']) assert(html.includes(expected), `Missing ${expected}`)
assert.match(html, /High-Risk Incidents<\/h3><strong[^>]*>40<\/strong>/)
html = cards(data)
assert(html.includes('Insufficient data') && html.includes('Unavailable') && !html.includes('0 / 100'))
const partial = structuredClone(actual)
partial.coverage.find((entry) => entry.source === 'incidents').complete = false
partial.metrics.risk = { ...partial.metrics.risk, state: 'incomplete', score: null, band: null }
partial.metrics.highRisk.state = 'incomplete'
partial.metrics.category = { ...partial.metrics.category, state: 'incomplete', share: null }
html = cards(partial)
assert(html.includes('Known counts only') && !html.includes('34 / 100') && !html.includes('Fixture Site'))
const zeroBaseline = structuredClone(actual)
zeroBaseline.metrics.nearMiss = { state: 'available', reasons: [], currentCount: 3, previousCount: 0, percentageChange: null, direction: 'new_reporting' }
html = cards(zeroBaseline)
assert(html.includes('New reporting') && html.includes('Percentage unavailable'))
const callerActions = structuredClone(actual)
callerActions.coverage.find((entry) => entry.source === 'actions').access = 'caller_visible'
assert(cards(callerActions).includes('caller-visible action coverage only'))
const siteOnly = structuredClone(actual)
siteOnly.locations = siteOnly.locations.filter((entry) => entry.level === 'site')
siteOnly.dataQuality.unassignedFacility = siteOnly.metrics.category.denominator
html = cards(siteOnly)
assert(html.includes('Highest Risk Site') && html.includes('Fixture Site'))
const dataQualitySnapshot = structuredClone(actual)
dataQualitySnapshot.dataQuality.unclassified = 1
dataQualitySnapshot.dataQuality.missingReportedAt = 1
dataQualitySnapshot.dataQuality.unassignedFacility = 1
assert(cards(dataQualitySnapshot).includes('Highest Risk Site')
  && cards(dataQualitySnapshot).includes('reports lack an available site assignment'))
const improved = structuredClone(actual)
improved.metrics.resolution.changeDays = -2
improved.metrics.resolution.previousAverageDays = 4
improved.metrics.resolution.previousSampleSize = 3
assert(cards(improved).includes('-2 days versus previous period (3 closures)'))
for (const [band, score] of [['High', 70], ['Low', 10]]) {
  const colored = structuredClone(actual)
  colored.metrics.risk = { ...colored.metrics.risk, band, score }
  assert(cards(colored).includes(`safety-risk-${band.toLowerCase()}`))
}
const css = read('../src/index.css')
assert(css.includes('.safety-section-heading') && css.includes('flex-wrap: wrap'))
assert(css.includes('@media (max-width: 640px)') && css.includes('.safety-intelligence-section'))
assert(css.includes('.dark-theme .workspace-panel'))
assert(css.includes('.safety-kpi-grid') && css.includes('repeat(3, minmax(0, 1fr))')
  && css.includes('repeat(2, minmax(0, 1fr))') && css.includes('grid-template-columns: minmax(0, 1fr)'))
console.log('PASS: five primary areas, Account Settings after Administration, permission guards and legacy routes')
console.log('PASS: real shell rendering for loading/error/empty/personal/ready/incomplete states and Refresh')
console.log('PASS: responsive wrapping/mobile rules and existing dark panel styles (not a browser layout test)')
console.log('PASS: eleven distinct KPI cards, real counts, closure-date blocker, unavailable/partial states and 90/30-day hook selection')
console.log('PASS: location guidance rendering, observed counts, advisory labels and authorized incident links')
console.log('PASS: planning outlook drivers, methodology, empty/sparse states and no unsupported predictive output')
console.log('PASS: priority-only site outlook, urgent sparse/overdue drivers, six initial rows, expandable remainder and deterministic priority ordering')
