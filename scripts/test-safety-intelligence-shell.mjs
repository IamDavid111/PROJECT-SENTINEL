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
const app = read('../src/App.tsx')
const primary = app.split('const primaryNavigation:')[1].split('const secondaryNavigation:')[0]
const secondary = app.split('const secondaryNavigation:')[1].split('const futureModuleRoutes:')[0]
const labels = [...primary.matchAll(/label: '([^']+)'/g)].map((match) => match[1])
assert.deepEqual(labels, ['Dashboard', 'Report Incident', 'Safety Intelligence', 'Executive Analytics', 'HSE Marketplace'])
assert.match(primary, /route: 'ai-assistant', label: 'Safety Intelligence', icon: Sparkles, permission: 'use_ai_assistant'/)
const accountLabels = [...secondary.matchAll(/label: '([^']+)'/g)].map((match) => match[1])
assert.equal(accountLabels[accountLabels.indexOf('Administration') + 1], 'Settings')
assert(!primary.includes("route: 'settings'"))
assert(secondary.includes("route: 'settings', label: 'Settings', permission: 'manage_settings'"))
assert(app.includes("const visibleSecondaryNavigation = secondaryNavigation.filter((item) => item.route === 'settings' ? canManageCompanySettings && canAccess(item.permission) : canAccess(item.permission))"))
assert(secondary.includes("route: 'incidents'"))
assert(app.includes("requestedRoute === 'ai-assistant'") && app.includes("route === 'ai-assistant'"))
assert(app.includes("canManageCompanySettings && canAccess(item.permission)"))
assert(app.includes("{canAccess('use_ai_assistant') && <a"))
assert(app.includes("route === 'ai-assistant' && canAccess('use_ai_assistant')"))
assert(app.includes("title=\"Safety Intelligence\" aria-label=\"Safety Intelligence\""))
assert(app.includes("'Operations / Safety Intelligence'"))

let query
let calls = 0
let days = 90
let requestedDays
let planningExpanded = false
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
      if (name === './useSafetyIntelligence') return { useSafetyIntelligence: (_client, _scope, filters) => { requestedDays = filters.days; return query } }
      if (name === './safetyIntelligenceService') return { SafetyIntelligenceError: TestServiceError }
      if (name === '../ai/SafetyAssistant') return { SafetyAssistant: () => createElement('section', null,
        createElement('h2', null, 'AI Safety Assistant'), createElement('textarea', { 'aria-label': 'Your question' })) }
      if (name === 'react') return { ...require(name), useState: (initial) => typeof initial === 'boolean'
        ? [planningExpanded, (value) => { planningExpanded = typeof value === 'function' ? value(planningExpanded) : value }]
        : [days, (value) => { days = value }] }
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
const Page = load(resolve(root, 'src/features/safety-intelligence/SafetyIntelligencePage.tsx')).SafetyIntelligencePage
const { calculateSafetySnapshot } = load(resolve(root, 'supabase/functions/_shared/safetyIntelligenceCalculations.ts'))
const { dataset, scope, asOf, incident, org } = load(resolve(root, 'supabase/functions/safety-intelligence/fixtures_test.ts'))
const props = { client: {}, scope }
const data = calculateSafetySnapshot(dataset(), scope, { days: 90 }, asOf)
const render = (state) => {
  query = { isPending: false, isError: false, isFetching: false, refetch: () => { calls++; return Promise.resolve() }, ...state }
  return renderToStaticMarkup(createElement(Page, props))
}
let html = render({ isPending: true, isFetching: true })
assert(html.includes('Loading authorized operational data') && html.includes('disabled=""'))
html = render({ isError: true, error: new TestServiceError('Service unavailable.'), data })
assert(html.includes('role="alert"') && html.includes('test-request-reference'))
assert(!html.includes('Snapshot:') && !html.includes('Organization coverage'))
assert(!html.includes('Safety Intelligence metrics'), 'Cached cards appeared after failed access refresh')
assert(!html.includes('High-Risk Sites &amp; Recommendations'), 'Cached sites appeared after failed access refresh')
assert(!html.includes('14-Day Safety Planning Indicators'), 'Cached outlook appeared after failed access refresh')
html = render({ data })
assert(html.includes('No authorized reported events') && html.includes('Organization coverage'))
html = render({ data: calculateSafetySnapshot(dataset(Array.from({ length: 12 }, (_, n) => incident(n))), { ...scope, visibility: 'personal' }, { days: 90 }, asOf) })
assert(html.includes('My reports') && html.includes('Authorized operational data is connected'))
html = render({ data: { ...data, coverage: [{ source: 'incidents', complete: false }] } })
assert(html.includes('retrieval is incomplete'))
assert(html.includes('AI Safety Intelligence') && html.includes('AI Safety Assistant') && html.includes('<textarea'))
assert(!html.includes('confidence'))
// Confirm Refresh is wired, not merely a button-shaped label.
const tree = Page(props)
const visit = (node) => {
  if (!node || typeof node !== 'object') return
  if (node.type === 'button') node.props.onClick()
  for (const child of [node.props?.children].flat(Infinity)) visit(child)
}
visit(tree)
assert.equal(calls, 1)
assert.equal(days, 90)
assert.equal(requestedDays, 90)
const buttons = []
const collect = (node) => {
  if (!node || typeof node !== 'object') return
  if (node.type === 'button') buttons.push(node)
  for (const child of [node.props?.children].flat(Infinity)) collect(child)
}
collect(Page(props))
buttons.find((button) => Array.isArray(button.props.children) && button.props.children[0] === 30).props.onClick()
render({ data })
assert.equal(days, 30)
assert.equal(requestedDays, 30)

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
assert.equal((html.match(/<article/g) || []).length, 6)
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
console.log('PASS: six actual KPI values, unavailable/partial states, zero baseline, risk colors and 90/30-day hook selection')
console.log('PASS: location guidance rendering, observed counts, advisory labels and authorized incident links')
console.log('PASS: planning outlook drivers, methodology, empty/sparse states and no unsupported predictive output')
console.log('PASS: priority-only site outlook, urgent sparse/overdue drivers, six initial rows, expandable remainder and deterministic priority ordering')
