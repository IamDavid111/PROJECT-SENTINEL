import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))
let state
let controller
let evidenceQuery = { isFetching: false, isError: false, data: [], refetch() {} }
function load(path) {
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const module = { exports: {} }
  runInNewContext(compiled, {
    exports: module.exports, module, Date, window: { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } },
    require: (name) => {
      if (name === 'react') return { ...require(name), useEffect() {},
        useMemo: (factory) => { controller = factory(); return controller }, useRef: () => ({ current: null }),
        useSyncExternalStore: (_subscribe, get) => state ?? get() }
      if (name === '@tanstack/react-query') return { useQueryClient: () => ({}), useQuery: () => evidenceQuery }
      if (name.startsWith('.')) {
        const target = resolve(dirname(path), name)
        return load(target.endsWith('.ts') ? target : `${target}${target.endsWith('SafetyAssistant') || target.endsWith('AnswerEvidence') ? '.tsx' : '.ts'}`)
      }
      return require(name)
    },
  })
  return module.exports
}
const { SafetyAssistant } = load(resolve(root, 'src/features/ai/SafetyAssistant.tsx'))
const props = { client: {}, scope: { userId: 'user', organizationId: 'org' } }
const render = () => renderToStaticMarkup(createElement(SafetyAssistant, props))
let html = render()
const base = controller.getSnapshot()
assert(html.includes('New Chat') && html.includes('Your conversations') && html.includes('Your question'))
assert(html.includes('Suggested prompts') && html.includes('assistant-sidebar') && html.includes('assistant-chat-heading'))
assert(html.indexOf('assistant-chat') < html.indexOf('assistant-sidebar'), 'Conversation should precede tools on small screens')
assert(html.includes('Send question') && html.includes('Nothing is sent until'))
assert(html.includes('No procedure, regulatory, inspection or audit knowledge library'))
assert(html.includes('authorized sites') && !html.includes('Fixture Facility'))
assert(html.includes('maxLength="4000"') && html.includes('30 days after creation'))
state = { ...base, loading: true }
html = render()
assert(html.includes('Loading your private conversation') && html.includes('disabled=""'))
state = { ...base, error: 'Service unavailable (Request reference: test)', storageError: 'Storage unavailable' }
html = render()
assert(html.includes('role="alert"') && html.includes('Request reference: test') && html.includes('Storage unavailable'))
state = { ...base, messages: [
  { id: 1, role: 'user', content: '<script>untrusted</script>', status: 'failed' },
  { id: 2, role: 'assistant', content: 'Canonical observation\nAdvisory', status: 'succeeded' },
] }
html = render()
assert(html.includes('assistant-message-user') && html.includes('assistant-message-assistant'))
assert(html.includes('&lt;script&gt;') && !html.includes('<script>'))
assert(html.includes('Request failed') && html.includes('Safety Copilot'))
state = { ...base, stopped: true, draft: 'Question' }
html = render()
assert.match(html, /<textarea[^>]*disabled=""/)
assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/)
state = { ...base, busy: true }
html = render()
assert(html.includes('Processing your request'))
console.log('Assistant UI rendering: welcome, composer, lifecycle, errors, advisory bubbles and safe text passed.')

const record = 'ab000000-0000-4000-8000-000000000101'
const { AnswerEvidence, AnswerSections } = load(resolve(root, 'src/features/ai/AnswerEvidence.tsx'))
const evidence = {
  request_id: 'ab000000-0000-4000-8000-000000000900', sourceIds: [`incidents:${record}`],
  asOf: '2026-10-06T12:00:00.000Z', visibility: 'personal', methodology: 'safety-intelligence-v1',
  presentation: { observations: [{ key: 'highRisk', value: '{"state":"available","reasons":[],"count":34,"openCount":27}' }],
    interpretation: '<script>not executable</script>', advice: 'Human review', limitations: 'Bounded', serverLimitations: ['No documents'] },
}
html = renderToStaticMarkup(createElement(AnswerSections, { evidence }))
assert(html.includes('Observed facts at answer time') && html.includes('34 high-risk; 27 still open'))
assert(html.includes('AI interpretation') && html.includes('Advisory recommendations') && html.includes('Coverage and limitations'))
assert(html.includes('&lt;script&gt;') && !html.includes('<script>'))
const source = { key: `incidents:${record}`, incidentId: record, label: 'Currently visible record', date: '2026-10-01', recordType: 'incidents' }
const renderEvidence = () => renderToStaticMarkup(createElement(AnswerEvidence, { ...props, evidence }))
evidenceQuery = { ...evidenceQuery, data: [source] }
html = renderEvidence()
assert(html.includes(`#incident-detail?id=${record}`) && html.includes('Currently visible record') && html.includes('2026-10-01'))
for (const pending of [{ isFetching: true, isError: false }, { isFetching: false, isError: true, error: new Error('Access check failed') }]) {
  evidenceQuery = { ...evidenceQuery, ...pending }
  html = renderEvidence()
  assert(!html.includes('Currently visible record') && !html.includes('#incident-detail'))
}
evidenceQuery = { ...evidenceQuery, isError: false, data: [] }
html = renderEvidence()
assert(html.includes('no longer accessible') && !html.includes('Currently visible record'))
html = renderToStaticMarkup(createElement(AnswerSections, { evidence: { ...evidence, presentation: null } }))
assert(html.includes('older answer') && html.includes('no evidence metadata is inferred'))
console.log('Evidence UI: separated facts/advice, safe text, permitted links/date, stale/error hiding and legacy notices passed.')
