import type { SupabaseClient } from '@supabase/supabase-js'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, Packer } from 'docx'
import { safetySnapshotSchema, type SafetyFilters, type SafetyScope, type SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { getSafetySnapshot } from './safetyIntelligenceService'
import { SafetyKpiCards } from './SafetyKpiCards'
import { SafetyLocations } from './SafetyLocations'
import { SafetyPlanningOutlook } from './SafetyPlanningOutlook'

export type AnalyticsReportFormat = 'pdf' | 'docx' | 'print'
type ReportBlock = { kind: 'heading' | 'text'; text: string } | { kind: 'table'; rows: string[][] }
export type AnalyticsReport = {
  title: string; organizationName: string; generatedAt: string; snapshotAt: string;
  period: string; scope: string; html: string;
  kpis: { title: string; value: string; evidence: string }[];
  blocks: ReportBlock[];
}

const text = (node: Node): string => node.nodeType === 3 ? node.textContent ?? ''
  : Array.from(node.childNodes).map(text).join(' ').replace(/\s+/g, ' ').trim()

// Refresh through the existing authenticated endpoint on every export; cached UI grants cannot authorize it.
export async function prepareExecutiveAnalyticsReport(
  client: SupabaseClient, scope: SafetyScope, filters: SafetyFilters,
  refresh: () => Promise<SafetySnapshot> = () => getSafetySnapshot(client, filters),
): Promise<AnalyticsReport> {
  const snapshot = safetySnapshotSchema.parse(await refresh())
  if (snapshot.scope.organizationId !== scope.organizationId || snapshot.scope.userId !== scope.userId
    || snapshot.scope.visibility !== scope.visibility || snapshot.scope.siteId !== scope.siteId
    || snapshot.filters.days !== filters.days || snapshot.filters.siteId !== filters.siteId
    || snapshot.filters.trendDays !== filters.trendDays) {
    throw new Error('Analytics access or reporting scope changed. Reload before exporting.')
  }
  const { data: organization, error } = await client.from('organizations').select('company_name')
    .eq('id', snapshot.scope.organizationId).maybeSingle()
  if (error) throw new Error('Unable to verify the report organization.')
  if (typeof organization?.company_name !== 'string' || !organization.company_name.trim()) {
    throw new Error('The authorized organization name is unavailable. No report was generated.')
  }
  // Render the actual cards and guidance rather than maintaining a second calculation/presentation pipeline.
  const markup = renderToStaticMarkup(<>
    <SafetyKpiCards snapshot={snapshot} />
    <SafetyLocations snapshot={snapshot} />
    <SafetyPlanningOutlook snapshot={snapshot} report />
  </>)
  const doc = new DOMParser().parseFromString(markup, 'text/html')
  doc.querySelectorAll('button, svg').forEach((node) => node.remove())
  doc.querySelectorAll('details').forEach((node) => node.setAttribute('open', ''))
  doc.querySelectorAll('a').forEach((node) => node.removeAttribute('href'))
  doc.querySelectorAll('[tabindex]').forEach((node) => node.removeAttribute('tabindex'))
  const kpis = Array.from(doc.querySelectorAll('article')).map((card) => ({
    title: text(card.querySelector('h3')!), value: text(card.querySelector('.safety-kpi-value')!),
    evidence: Array.from(card.querySelectorAll('.safety-kpi-description, .safety-kpi-details')).map(text).join(' '),
  }))
  if (kpis.length !== 11 || kpis.some((card) => !card.title || !card.value)) {
    throw new Error('The analytics report is incomplete. No file was generated.')
  }
  const blocks: ReportBlock[] = []
  const collect = (element: Element) => {
    if (element.tagName === 'TABLE') {
      blocks.push({ kind: 'table', rows: Array.from(element.querySelectorAll('tr')).map((row) =>
        Array.from(row.querySelectorAll('th, td')).map(text)) })
    } else if (/^H[1-6]$/.test(element.tagName)) {
      blocks.push({ kind: 'heading', text: text(element) })
    } else if (['P', 'LI', 'SMALL'].includes(element.tagName)) {
      blocks.push({ kind: 'text', text: text(element) })
    } else {
      Array.from(element.children).forEach(collect)
    }
  }
  doc.querySelectorAll('section.safety-locations').forEach(collect)
  blocks.push({ kind: 'heading', text: 'Snapshot coverage and methodology' },
    { kind: 'text', text: 'Read-only deterministic indicators and advisory guidance, not a trained prediction or regulatory compliance assessment. Resolution uses trusted incident closure dates; near misses use comparable month-to-date periods. Outstanding actions use the current backlog.' },
    { kind: 'text', text: `Data quality: ${JSON.stringify(snapshot.dataQuality)}. ${snapshot.evidenceTruncated ? 'Evidence excerpts are bounded and may be incomplete.' : ''}` },
    ...snapshot.coverage.map((source): ReportBlock => ({
      kind: 'text', text: `${source.source}: ${source.complete ? 'complete retrieval' : 'incomplete retrieval'}, ${source.access}; ${source.included} included. ${source.reasons.join(' ')}`,
    })))
  return {
    title: 'SentinelQHSE Executive Analytics', organizationName: organization.company_name.trim(),
    generatedAt: snapshot.generatedAt, snapshotAt: snapshot.asOf,
    period: `${filters.days === 'all' ? 'All Time' : `${filters.days} days`}: ${snapshot.windows.reporting.start} to ${snapshot.windows.reporting.end} (UTC; end excluded)`,
    scope: `${scope.visibility === 'organization' ? 'Organization coverage' : 'My reports / caller-visible coverage'}${scope.siteId ? `; selected site ${scope.siteId}` : ''}`,
    html: doc.body.innerHTML, kpis, blocks,
  }
}

const metadata = (report: AnalyticsReport) => [
  `Organization: ${report.organizationName}`, `Generated: ${report.generatedAt} (UTC)`,
  `Snapshot: ${report.snapshotAt} (UTC)`, `Reporting period: ${report.period}`, `Scope: ${report.scope}`,
]
const filename = (report: AnalyticsReport, format: 'pdf' | 'docx') =>
  `SentinelQHSE_Executive_Analytics_${report.generatedAt.slice(0, 10)}.${format}`

async function browserRenderedPdf(report: AnalyticsReport): Promise<Blob> {
  // jsPDF already provides html2canvas; use browser fonts instead of corrupting unsupported scripts.
  const { default: html2canvas } = await import('html2canvas')
  const pdf = new jsPDF({ compress: true })
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:760px;padding:16px;box-sizing:border-box;background:white;color:#0f172a;font:16px/1.5 Arial,sans-serif;overflow-wrap:anywhere;'
  document.body.append(host)
  const pageWidth = pdf.internal.pageSize.width
  const pageHeight = pdf.internal.pageSize.height
  const margin = 14
  const width = pageWidth - margin * 2
  const bottom = pageHeight - 20
  let y = margin
  const addBlock = async (title: string | null, value: string) => {
    host.replaceChildren()
    if (title) {
      const heading = document.createElement('h2')
      heading.style.cssText = 'font-size:20px;color:#0f4a3e;margin:0 0 8px;'
      heading.textContent = title
      host.append(heading)
    }
    const paragraph = document.createElement('p')
    paragraph.style.cssText = 'margin:0;white-space:pre-wrap;'
    paragraph.textContent = value
    host.append(paragraph)
    if (host.scrollHeight > 10_000) throw new Error('A report section is too large for browser-rendered PDF. Use Word or Print.')
    const canvas = await html2canvas(host, { backgroundColor: '#ffffff', scale: 1.5, logging: false })
    if (!canvas.width || !canvas.height) throw new Error('The browser could not render the PDF report.')
    const height = canvas.height * width / canvas.width
    if (height <= bottom - margin && y + height > bottom) { pdf.addPage(); y = margin }
    let offset = 0
    while (offset < canvas.height) {
      const remaining = Math.floor((bottom - y) * canvas.width / width)
      if (remaining < 1) { pdf.addPage(); y = margin; continue }
      const slice = document.createElement('canvas')
      slice.width = canvas.width
      slice.height = Math.min(canvas.height - offset, remaining)
      const context = slice.getContext('2d')
      if (!context) throw new Error('The browser could not create the PDF image.')
      context.drawImage(canvas, 0, offset, canvas.width, slice.height, 0, 0, canvas.width, slice.height)
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, y, width,
        slice.height * width / slice.width, undefined, 'FAST')
      y += slice.height * width / slice.width
      offset += slice.height
      if (offset < canvas.height) { pdf.addPage(); y = margin }
    }
  }
  try {
    await document.fonts.ready
    await addBlock(report.title, metadata(report).join('\n'))
    for (const card of report.kpis) await addBlock(card.title, `${card.value}\n${card.evidence}`)
    for (const block of report.blocks) {
      if (block.kind === 'table') {
        const headers = block.rows[0] ?? []
        for (const row of block.rows.slice(1)) {
          await addBlock(null, row.map((cell, index) => `${headers[index] ?? ''}: ${cell}`).join('\n'))
        }
      } else {
        await addBlock(block.kind === 'heading' ? block.text : null, block.kind === 'heading' ? '' : block.text)
      }
    }
    for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
      pdf.setPage(page)
      pdf.setFontSize(8)
      pdf.text(`SentinelQHSE Executive Analytics | Page ${page} | Browser-rendered text`, margin, pageHeight - 8)
    }
    return pdf.output('blob')
  } finally {
    host.remove()
  }
}

export async function executiveAnalyticsPdf(report: AnalyticsReport): Promise<Blob> {
  const content = [report.title, ...metadata(report), ...report.kpis.flatMap((card) =>
    [card.title, card.value, card.evidence]), ...report.blocks.flatMap((block) =>
    block.kind === 'table' ? block.rows.flat() : [block.text])].join('\n')
  if (/[^\x09\x0a\x0d\x20-\xff↑↓→—–’‘“”]/.test(content)) return browserRenderedPdf(report)
  const pdf = new jsPDF()
  // Built-in PDF fonts do not encode the UI's directional arrows.
  const printable = (value: string) => {
    const normalized = value.replaceAll('↑', 'up').replaceAll('↓', 'down')
      .replaceAll('→', 'unchanged').replaceAll('—', '-').replaceAll('–', '-')
      .replaceAll('’', "'").replaceAll('‘', "'").replaceAll('“', '"').replaceAll('”', '"')
    return normalized
  }
  const rows = [
    [{ content: report.title, colSpan: 3, styles: { fontSize: 17, fontStyle: 'bold' as const,
      textColor: '#ffffff', fillColor: '#0f4a3e' } }],
    ...metadata(report).map((value) => [{ content: printable(value), colSpan: 3 }]),
    ['KPI', 'Value', 'Evidence / limitations'].map((content) => ({
      content, styles: { fontStyle: 'bold' as const, fillColor: '#e8f3ef' },
    })),
    ...report.kpis.map((card) => [printable(card.title), printable(card.value), printable(card.evidence)]),
    ...report.blocks.flatMap((block) => block.kind === 'table'
      ? block.rows.map((row) => [{ content: printable(row.join(' | ')), colSpan: 3 }])
      : [[{ content: printable(block.text), colSpan: 3,
        styles: { fontStyle: block.kind === 'heading' ? 'bold' as const : 'normal' as const } }]]),
  ]
  autoTable(pdf, {
    body: rows, theme: 'grid', margin: { top: 14, bottom: 18 }, rowPageBreak: 'avoid',
    styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak', textColor: '#0f172a' },
    didDrawPage: ({ pageNumber }) => {
      pdf.setFontSize(8)
      pdf.text(`SentinelQHSE Executive Analytics | Page ${pageNumber}`, 14, pdf.internal.pageSize.height - 8)
    },
  })
  return pdf.output('blob')
}

export async function executiveAnalyticsWord(report: AnalyticsReport): Promise<Blob> {
  const table = (rows: string[][]) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, index) => new TableRow({ tableHeader: index === 0,
      children: row.map((value) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: value, bold: index === 0 })] })],
        shading: index === 0 ? { fill: 'E8F3EF' } : undefined,
      })),
    })),
  })
  return Packer.toBlob(new Document({ sections: [{ children: [
    new Paragraph({ text: report.title, heading: HeadingLevel.HEADING_1 }),
    ...metadata(report).map((value) => new Paragraph(value)),
    table([['KPI', 'Value', 'Evidence / limitations'],
      ...report.kpis.map((card) => [card.title, card.value, card.evidence])]),
    ...report.blocks.map((block) => block.kind === 'table' ? table(block.rows)
      : new Paragraph({ text: block.text, heading: block.kind === 'heading' ? HeadingLevel.HEADING_2 : undefined,
        spacing: { after: 120 } })),
  ] }] }))
}

export function executiveAnalyticsPrintHtml(report: AnalyticsReport): string {
  const header = renderToStaticMarkup(createElement('header', null,
    createElement('h1', null, report.title), ...metadata(report).map((value) => createElement('p', { key: value }, value))))
  const coverage = renderToStaticMarkup(<section><h2>Snapshot coverage and methodology</h2>
    {report.blocks.slice(report.blocks.findIndex((block) => block.kind === 'heading'
      && block.text === 'Snapshot coverage and methodology') + 1)
      .map((block, index) => block.kind !== 'table' && <p key={index}>{block.text}</p>)}</section>)
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${report.title}</title>
<style>
@page { size: A4; margin: 15mm; }
body { font: 11pt Arial, sans-serif; color: #0f172a; margin: 20px; }
h1 { font-size: 20pt; color: #0f4a3e; } h3 { color: #0f4a3e; }
header { border-bottom: 2px solid #0f4a3e; margin-bottom: 16px; }
.safety-kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
article { border: 1px solid #cbd5e1; padding: 10px; break-inside: avoid; }
.safety-kpi-value { font-size: 16pt; } small { display: block; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; } th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; }
thead { display: table-header-group; } tr { break-inside: avoid; }
details > summary { font-weight: bold; } section { margin-top: 18px; }
@media print { body { margin: 0; } button, nav, svg { display: none !important; } }
</style></head><body>${header}${report.html}${coverage}</body></html>`
}

export async function outputExecutiveAnalyticsReport(report: AnalyticsReport, format: AnalyticsReportFormat): Promise<void> {
  if (format === 'print') {
    const frame = document.createElement('iframe')
    frame.title = report.title
    frame.style.cssText = 'position:fixed;width:0;height:0;border:0;'
    document.body.append(frame)
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error('Print report preparation timed out.')), 10_000)
        frame.onload = () => { window.clearTimeout(timeout); resolve() }
        frame.srcdoc = executiveAnalyticsPrintHtml(report)
      })
      const printWindow = frame.contentWindow
      if (!printWindow) throw new Error('The browser could not open the print report.')
      printWindow.addEventListener('afterprint', () => frame.remove(), { once: true })
      printWindow.focus()
      printWindow.print()
      // Browsers without afterprint still release the isolated report frame.
      window.setTimeout(() => frame.remove(), 300_000)
    } catch (error) {
      frame.remove()
      throw error
    }
    return
  }
  const blob = format === 'pdf' ? await executiveAnalyticsPdf(report) : await executiveAnalyticsWord(report)
  if (!blob.size) throw new Error('The report file is empty. No download was started.')
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filename(report, format)
    link.click()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
