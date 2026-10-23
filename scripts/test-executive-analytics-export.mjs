// Run in the local frontend browser to verify real DOM preparation and binary format generation.
import { prepareExecutiveAnalyticsReport, executiveAnalyticsPdf, executiveAnalyticsWord,
  executiveAnalyticsPrintHtml, outputExecutiveAnalyticsReport } from '../src/features/safety-intelligence/executiveAnalyticsReport.tsx'
import { calculateSafetySnapshot } from '../supabase/functions/_shared/safetyIntelligenceCalculations.ts'
import { dataset, incident, scope, asOf } from '../supabase/functions/safety-intelligence/fixtures_test.ts'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafetyIntelligencePage } from '../src/features/safety-intelligence/SafetyIntelligencePage.tsx'

let verification
export function removeAnalyticsVerification() {
  verification?.root.unmount()
  verification?.queryClient.clear()
  verification?.host.remove()
  verification = undefined
}

// Visual/runtime tests mount production components with explicit test records, never production substitutes.
export async function mountAnalyticsVerification() {
  removeAnalyticsVerification()
  document.getElementById('analytics-verification')?.remove()
  const host = document.createElement('div')
  host.id = 'analytics-verification'
  host.style.cssText = 'position:absolute;inset:0;z-index:1000;background:var(--surface);padding:20px;'
  document.body.append(host)
  const root = createRoot(host)
  const queryClient = new QueryClient()
  const callbacks = []
  let revoked = false
  const channel = { on(_type, _filter, callback) { callbacks.push(callback); return this }, subscribe() { return this } }
  const client = {
    channel: () => channel, removeChannel: async () => {},
    functions: { invoke: async (_name, { body }) => ({
      data: revoked ? { ok: false, requestId: 'ab000000-0000-4000-8000-000000000900', error: {
        code: 'access_denied', message: 'You do not have permission to view Executive Analytics. Please ask your Super Admin to grant you access.',
      } } : { ok: true, requestId: 'ab000000-0000-4000-8000-000000000901',
        snapshot: calculateSafetySnapshot(dataset(Array.from({ length: 12 }, (_, n) =>
          incident(n, { severity: 'High' }))), scope, body, asOf) }, error: null,
    }) },
  }
  verification = { root, queryClient, host, revoke: () => { revoked = true; callbacks[0]() } }
  root.render(React.createElement(QueryClientProvider, { client: queryClient },
    React.createElement(SafetyIntelligencePage, { client, scope, view: 'executive-analytics', canExportAnalytics: true })))
  for (let attempt = 0; attempt < 40 && host.querySelectorAll('article').length !== 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert(host.querySelectorAll('article').length === 10, 'Analytics verification view did not load')
  return { mounted: true, cards: 10 }
}

export async function verifyLiveAccessWithdrawal() {
  if (!verification) await mountAnalyticsVerification()
  verification.revoke()
  for (let attempt = 0; attempt < 40 && !verification.host.querySelector('[role="alert"]'); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert(verification.host.querySelectorAll('article').length === 0, 'Loaded evidence remained after access revocation')
  assert(verification.host.textContent.includes('You do not have permission to view Executive Analytics.'),
    'Access revocation did not show the server denial')
  assert(Array.from(verification.host.querySelectorAll('.safety-export button')).every((button) => button.disabled),
    'Exports remained enabled after revocation')
  removeAnalyticsVerification()
  return { passed: true, withdrawnCards: 11, exportsDisabled: true }
}

const assert = (condition, message) => { if (!condition) throw new Error(message) }

export async function runExportTests() {
  let requests = 0
  let organizationReads = 0
  let expectedDays = 90
  let fail = false
  let foreign = false
  let missingName = false
  const records = dataset(Array.from({ length: 12 }, (_, index) => incident(index, {
    severity: 'High', site_id: `ab000000-0000-4000-8000-${String(600 + index).padStart(12, '0')}`,
  })))
  records.rows.sites = records.rows.incidents.map((row, index) => ({
    id: row.site_id, organization_id: scope.organizationId, name: `Recorded Site ${index}`,
  }))
  const client = {
    functions: { invoke: async (_name, { body }) => {
      requests++
      assert(body.days === expectedDays && !body.organizationId && !body.userId, 'Unsafe export request payload')
      return { data: fail ? { ok: false, requestId: 'ab000000-0000-4000-8000-000000000900', error: {
        code: 'access_denied', message: 'You do not have permission to view Executive Analytics. Please ask your Super Admin to grant you access.',
      } } : { ok: true, requestId: 'ab000000-0000-4000-8000-000000000901', snapshot: calculateSafetySnapshot(records,
        foreign ? { ...scope, userId: 'ab000000-0000-4000-8000-000000000999' } : scope, body, asOf) }, error: null }
    } },
    from: (table) => {
      assert(table === 'organizations', 'Unexpected report query')
      const query = {
        select: () => query,
        eq: (_key, value) => { assert(value === scope.organizationId, 'Foreign organization name query'); return query },
        maybeSingle: async () => {
          organizationReads++
          return { data: missingName ? null : { company_name: 'Authorized <script>alert(1)</script> Organization' }, error: null }
        },
      }
      return query
    },
  }
  const report = await prepareExecutiveAnalyticsReport(client, scope, { days: 90 })
  assert(requests === 1 && organizationReads === 1, 'Preparation did not refresh/revalidate')
  assert(report.kpis.length === 10 && new Set(report.kpis.map((card) => card.title)).size === 10, 'Missing/duplicate KPI cards')
  assert(report.kpis.find((card) => card.title === 'Total Incidents').value === '12', 'Wrong real-data incident total')
  assert(!report.kpis.some((card) => card.title === 'Corrective Action On-Time Closure'), 'Removed on-time closure card remains in report')
  assert(report.blocks.some((block) => block.kind === 'table' && block.rows.length === 13), 'Planning report omitted expanded priority sites')
  assert(report.blocks.some((block) => block.kind !== 'table' && block.text.includes('Advisory recommendations')), 'Missing recommendations')
  const printed = executiveAnalyticsPrintHtml(report)
  const parsed = new DOMParser().parseFromString(printed, 'text/html')
  assert(!parsed.querySelector('script, nav, button, svg'), 'Print output includes executable content or application controls')
  assert(parsed.querySelectorAll('details:not([open])').length === 0, 'Evidence hidden in print output')
  assert(parsed.body.textContent.includes('Authorized <script>alert(1)</script> Organization'), 'Organization name was not safely escaped')
  assert(printed.includes('@media print') && printed.includes(report.period), 'Missing print styling/report period')
  let printCalls = 0
  let printFrame
  const observer = new MutationObserver((changes) => {
    for (const change of changes) for (const node of change.addedNodes) {
      if (node instanceof HTMLIFrameElement && node.title === report.title) {
        printFrame = node
        node.addEventListener('load', () => {
          node.contentWindow.print = () => { printCalls++ }
        }, { once: true, capture: true })
      }
    }
  })
  observer.observe(document.body, { childList: true })
  try {
    await outputExecutiveAnalyticsReport(report, 'print')
    assert(printCalls === 1 && printFrame.contentDocument.body.textContent.includes('Outstanding Actions'),
      'Print handler did not invoke the dialog with the isolated report')
    printFrame.contentWindow.dispatchEvent(new Event('afterprint'))
    assert(!printFrame.isConnected, 'Print frame was not cleaned up')
  } finally {
    observer.disconnect()
    printFrame?.remove()
  }
  const pdf = await executiveAnalyticsPdf(report)
  const pdfText = await pdf.text()
  assert(pdf.type === 'application/pdf' && pdfText.startsWith('%PDF-'), 'Not a genuine PDF')
  const pdfContent = Array.from(pdfText.matchAll(/\(([^)]*)\) Tj/g), (match) => match[1]).join(' ')
  assert(pdfContent.includes('SentinelQHSE Executive Analytics') && pdfContent.includes('Outstanding Actions'), 'PDF missing report content')
  const word = await executiveAnalyticsWord(report)
  const bytes = new Uint8Array(await word.arrayBuffer())
  assert(bytes[0] === 0x50 && bytes[1] === 0x4b, 'Not a genuine zipped DOCX')
  const view = new DataView(bytes.buffer)
  let documentXml = ''
  for (let offset = 0; offset + 30 < bytes.length && view.getUint32(offset, true) === 0x04034b50;) {
    const size = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength))
    const start = offset + 30 + nameLength + extraLength
    if (name === 'word/document.xml') {
      const compressed = new Blob([bytes.slice(start, start + size)])
      const stream = view.getUint16(offset + 8, true) === 8
        ? compressed.stream().pipeThrough(new DecompressionStream('deflate-raw')) : compressed.stream()
      documentXml = await new Response(stream).text()
    }
    offset = start + size
  }
  assert(documentXml.includes('SentinelQHSE Executive Analytics') && documentXml.includes('Outstanding Actions')
    && documentXml.includes('Recorded Site 11'), 'DOCX missing real report content')
  const unicodePdf = await executiveAnalyticsPdf({ ...report, organizationName: '组织' })
  const unicodeContent = await unicodePdf.text()
  assert(unicodeContent.startsWith('%PDF-') && unicodeContent.includes('/Subtype /Image')
    && unicodeContent.includes('/FlateDecode'), 'Multilingual PDF did not use the genuine compressed browser-rendered fallback')
  assert(unicodePdf.size < 5_000_000, 'Small multilingual report produced an excessive PDF download')
  expectedDays = 30
  const shorter = await prepareExecutiveAnalyticsReport(client, scope, { days: 30 })
  assert(requests === 2 && shorter.period.startsWith('30 days:'), 'Period switch did not refresh report')
  const allTimeTrend = await prepareExecutiveAnalyticsReport(client, scope, { days: 30, trendDays: 'all' })
  assert(allTimeTrend.period === shorter.period && JSON.stringify(allTimeTrend.kpis) === JSON.stringify(shorter.kpis),
    'Chart All Time altered the exported reporting period or KPI values')
  expectedDays = 'all'
  const historical = await prepareExecutiveAnalyticsReport(client, scope, { days: 'all' })
  assert(historical.period.startsWith('All Time:') && historical.kpis.length === 10, 'All Time reporting export was not prepared')
  expectedDays = 30
  for (const scenario of ['denied', 'foreign', 'missing-name']) {
    fail = scenario === 'denied'
    foreign = scenario === 'foreign'
    missingName = scenario === 'missing-name'
    let rejected = false
    try { await prepareExecutiveAnalyticsReport(client, scope, { days: 30 }) } catch { rejected = true }
    assert(rejected, `Unsafe ${scenario} export was allowed`)
  }
  return { passed: true, kpis: report.kpis.length, pdfBytes: pdf.size, docxBytes: word.size,
    unicodePdfBytes: unicodePdf.size,
    checks: 'Fresh authorized scope, 30/90 periods, 10 KPIs, all planning sites, real PDF/DOCX, multilingual PDF fallback, print sanitization, denial/mismatch/missing-name failures' }
}
