import type { SupabaseClient } from '@supabase/supabase-js'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { jsPDF } from 'jspdf'
import autoTable, { type RowInput } from 'jspdf-autotable'
import { Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, Packer, ImageRun } from 'docx'
import { safetySnapshotSchema, type SafetyFilters, type SafetyScope, type SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { getSafetySnapshot } from './safetyIntelligenceService'
import { SafetyKpiCards } from './SafetyKpiCards'
import { SafetyLocations } from './SafetyLocations'
import { SafetyPlanningOutlook } from './SafetyPlanningOutlook'
import { IncidentTrendChart } from './IncidentTrendChart'

export type AnalyticsReportFormat = 'pdf' | 'docx' | 'print'
type ReportBlock = { kind: 'heading' | 'text'; text: string } | { kind: 'table'; rows: string[][]; colors?: (string | null)[][] }
const reportColors: Record<string, { accent: string; fill: string }> = {
  teal: { accent: '08776F', fill: 'F3F8F8' },
  blue: { accent: '285FA3', fill: 'F4F7FA' },
  green: { accent: '237443', fill: 'F4F8F6' },
  amber: { accent: '8C600F', fill: 'F9F7F3' },
  red: { accent: 'A8444C', fill: 'FBF6F6' },
}
export type AnalyticsReport = {
  title: string; organizationName: string; generatedAt: string; snapshotAt: string;
  period: string; scope: string; html: string;
  kpis: { title: string; value: string; evidence: string; accent: string; fill: string }[];
  chart?: string;
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
  const chartHost = document.createElement('div')
  chartHost.style.cssText = 'position:fixed;left:-10000px;top:0;width:760px;background:white;'
  document.body.append(chartHost)
  const chartRoot = createRoot(chartHost)
  try {
    flushSync(() => chartRoot.render(<IncidentTrendChart snapshot={snapshot} report />))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    doc.body.querySelector('.safety-kpi-grid')?.insertAdjacentHTML('afterend', chartHost.innerHTML)
  } finally {
    chartRoot.unmount()
    chartHost.remove()
  }
  const chart = doc.querySelector<SVGElement>('svg.recharts-surface[role="application"]')
  if (!chart && snapshot.incidentTrend?.complete && snapshot.incidentTrend.records.some((record) =>
    record.closedAt || (record.reportedAt && ['incident', 'near_miss'].includes(record.reportType)))) {
    throw new Error('The incident trend chart could not be rendered. No report was generated.')
  }
  doc.querySelectorAll('button, svg').forEach((node) => {
    if (node !== chart && !chart?.contains(node)) node.remove()
  })
  chart?.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  chart?.querySelectorAll('*').forEach((node) => {
    for (const attribute of ['fill', 'stroke']) {
      const value = node.getAttribute(attribute)
      if (value?.includes('var(--')) node.setAttribute(attribute, value.includes('--line') ? '#cbd5e1' : '#64748b')
    }
  })
  if (chart) {
    const width = Number(chart.getAttribute('width'))
    const height = Number(chart.getAttribute('height'))
    chart.setAttribute('height', String(height + 30))
    chart.setAttribute('viewBox', `0 0 ${width} ${height + 30}`)
    for (const [index, [label, color]] of [['Incidents', '#ff3b40'], ['Near Misses', '#529fe3'], ['Closed', '#2eb65a']].entries()) {
      const swatch = doc.createElementNS('http://www.w3.org/2000/svg', 'rect')
      for (const [key, value] of Object.entries({ x: String(20 + index * 160), y: String(height + 5), width: '12', height: '12', fill: color })) swatch.setAttribute(key, value)
      const labelNode = doc.createElementNS('http://www.w3.org/2000/svg', 'text')
      labelNode.setAttribute('x', String(38 + index * 160))
      labelNode.setAttribute('y', String(height + 16))
      labelNode.setAttribute('fill', color)
      labelNode.setAttribute('font-size', '13')
      labelNode.textContent = label
      chart.append(swatch, labelNode)
    }
  }
  const chartMarkup = chart?.outerHTML
  if (chart) {
    const image = doc.createElement('img')
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chart.outerHTML)}`
    image.alt = 'Incident Trend: Incidents (red), Near Misses (blue), Closed (green)'
    image.style.cssText = 'display:block;width:100%;height:auto;'
    chart.replaceWith(image)
    doc.querySelector('.recharts-legend-wrapper')?.remove()
  }
  doc.querySelectorAll('details').forEach((node) => node.setAttribute('open', ''))
  doc.querySelectorAll('a').forEach((node) => node.removeAttribute('href'))
  doc.querySelectorAll('[tabindex]').forEach((node) => node.removeAttribute('tabindex'))
  const kpis = Array.from(doc.querySelectorAll('article')).map((card) => ({
    title: text(card.querySelector('h3')!), value: text(card.querySelector('.safety-kpi-value')!),
    evidence: Array.from(card.querySelectorAll('.safety-kpi-description')).map(text).join(' '),
    ...(reportColors[Object.keys(reportColors).find((tone) => card.classList.contains(`safety-kpi-${tone}`)) ?? 'blue']),
  }))
  if (kpis.length !== 10 || kpis.some((card) => !card.title || !card.value)) {
    throw new Error('The analytics report is incomplete. No file was generated.')
  }
  const blocks: ReportBlock[] = []
  const collect = (element: Element) => {
    if (element.tagName === 'TABLE') {
      blocks.push({ kind: 'table', rows: Array.from(element.querySelectorAll('tr')).map((row) =>
        Array.from(row.querySelectorAll('th, td')).map(text)),
        colors: Array.from(element.querySelectorAll('tr')).map((row) => Array.from(row.querySelectorAll('th, td')).map((cell) =>
          cell.querySelector('.safety-indicator-high') ? 'C93636'
            : cell.querySelector('.safety-indicator-medium') ? '966009'
              : cell.querySelector('.safety-indicator-low') ? reportColors.green.accent : null)) })
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
    html: doc.body.innerHTML, kpis, blocks, chart: chartMarkup,
  }
}

const metadata = (report: AnalyticsReport) => [
  `Organization: ${report.organizationName}`, `Generated: ${report.generatedAt} (UTC)`,
  `Snapshot: ${report.snapshotAt} (UTC)`, `Reporting period: ${report.period}`, `Scope: ${report.scope}`,
]
const filename = (report: AnalyticsReport, format: 'pdf' | 'docx') =>
  `SentinelQHSE_Executive_Analytics_${report.generatedAt.slice(0, 10)}.${format}`

async function reportChartImage(report: AnalyticsReport): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  if (!report.chart) return null
  const url = URL.createObjectURL(new Blob([report.chart], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context || !canvas.width || !canvas.height) throw new Error('The report chart could not be rendered.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) =>
      result ? resolve(result) : reject(new Error('The report chart could not be encoded.')), 'image/png'))
    return { data: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

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
  const addBlock = async (title: string | null, value: string, accent = '0F4A3E', fill = 'FFFFFF') => {
    host.replaceChildren()
    host.style.backgroundColor = `#${fill}`
    if (title) {
      const heading = document.createElement('h2')
      heading.style.cssText = `font-size:20px;color:#${accent};margin:0 0 8px;`
      heading.textContent = title
      host.append(heading)
    }
    const paragraph = document.createElement('p')
    paragraph.style.cssText = 'margin:0;white-space:pre-wrap;'
    paragraph.textContent = value
    host.append(paragraph)
    if (host.scrollHeight > 10_000) throw new Error('A report section is too large for browser-rendered PDF. Use Word or Print.')
    const canvas = await html2canvas(host, { backgroundColor: `#${fill}`, scale: 1.5, logging: false })
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
    for (const card of report.kpis) await addBlock(card.title, `${card.value}\n${card.evidence}`, card.accent, card.fill)
    for (const block of report.blocks) {
      if (block.kind === 'table') {
        const headers = block.rows[0] ?? []
        for (const [index, row] of block.rows.slice(1).entries()) {
          const color = block.colors?.[index + 1]?.find(Boolean)
          await addBlock(color ? row[1] : null, row.map((cell, index) => `${headers[index] ?? ''}: ${cell}`).join('\n'), color ?? '0F4A3E')
        }
        const chartImage = await reportChartImage(report)
        if (chartImage) {
          pdf.addPage()
          pdf.addImage(chartImage.data, 'PNG', margin, margin, width, chartImage.height * width / chartImage.width)
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
  const rows: RowInput[] = [
    [{ content: report.title, colSpan: 3, styles: { fontSize: 17, fontStyle: 'bold' as const,
      textColor: '#ffffff', fillColor: '#0f4a3e' } }],
    ...metadata(report).map((value) => [{ content: printable(value), colSpan: 3 }]),
    ['KPI', 'Value', 'Evidence / limitations'].map((content) => ({
      content, styles: { fontStyle: 'bold' as const, fillColor: '#e8f3ef' },
    })),
    ...report.kpis.map((card) => [
      { content: printable(card.title), styles: { fillColor: `#${card.fill}`, textColor: `#${card.accent}`, fontStyle: 'bold' as const } },
      { content: printable(card.value), styles: { fillColor: `#${card.fill}`, textColor: `#${card.accent}` } },
      { content: printable(card.evidence), styles: { fillColor: `#${card.fill}` } },
    ]),
    ...report.blocks.flatMap<RowInput>((block) => block.kind === 'table'
      ? block.rows.map((row, index) => [{ content: printable(row.join(' | ')), colSpan: 3,
        styles: { textColor: `#${block.colors?.[index]?.find(Boolean) ?? '0F172A'}`,
          fillColor: index === 0 ? '#e8f3ef' : '#ffffff' } }])
      : [[{ content: printable(block.text), colSpan: 3,
        styles: { fontStyle: block.kind === 'heading' ? 'bold' as const : 'normal' as const,
          textColor: block.kind === 'heading' ? '#0f4a3e' : '#0f172a' } }]]),
  ]
  autoTable(pdf, {
    body: rows, theme: 'grid', margin: { top: 14, bottom: 18 }, rowPageBreak: 'avoid',
    styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak', textColor: '#0f172a' },
    didDrawPage: ({ pageNumber }) => {
      pdf.setFontSize(8)
      pdf.text(`SentinelQHSE Executive Analytics | Page ${pageNumber}`, 14, pdf.internal.pageSize.height - 8)
    },
  })
  const chartImage = await reportChartImage(report)
  if (chartImage) {
    pdf.addPage()
    pdf.setTextColor('#0f4a3e')
    pdf.text('Incident Trend', 14, 20)
    const width = pdf.internal.pageSize.width - 28
    pdf.addImage(chartImage.data, 'PNG', 14, 28, width, chartImage.height * width / chartImage.width)
  }
  return pdf.output('blob')
}

export async function executiveAnalyticsWord(report: AnalyticsReport): Promise<Blob> {
  const table = (rows: string[][], colors?: (string | null)[][], fills?: string[]) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, index) => new TableRow({ tableHeader: index === 0,
      children: row.map((value, column) => new TableCell({
        children: [new Paragraph({ children: [new TextRun({ text: value, bold: index === 0,
          color: colors?.[index]?.[column] ?? (index === 0 ? '0F4A3E' : '0F172A') })] })],
        shading: { fill: index === 0 ? 'E8F3EF' : fills?.[index] ?? 'FFFFFF' },
      })),
    })),
  })
  const chartImage = await reportChartImage(report)
  return Packer.toBlob(new Document({ styles: { default: { heading1: { run: { color: '0F4A3E' } },
    heading2: { run: { color: '0F4A3E' } } } }, sections: [{ children: [
    new Paragraph({ text: report.title, heading: HeadingLevel.HEADING_1 }),
    ...metadata(report).map((value) => new Paragraph(value)),
    table([['KPI', 'Value', 'Evidence / limitations'],
      ...report.kpis.map((card) => [card.title, card.value, card.evidence])],
      [[], ...report.kpis.map((card) => [card.accent, card.accent, null])],
      ['', ...report.kpis.map((card) => card.fill)]),
    ...(chartImage ? [new Paragraph({ text: 'Incident Trend', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ children: [new ImageRun({ type: 'png', data: chartImage.data,
        transformation: { width: 600, height: 600 * chartImage.height / chartImage.width } })] })] : []),
    ...report.blocks.map((block) => block.kind === 'table' ? table(block.rows, block.colors)
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
* { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
body { font: 11pt Arial, sans-serif; color: #0f172a; margin: 20px; }
h1 { font-size: 20pt; color: #0f4a3e; } h3 { color: #0f4a3e; }
header { border-bottom: 2px solid #0f4a3e; margin-bottom: 16px; }
.safety-kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
article { border: 1px solid #cbd5e1; padding: 10px; break-inside: avoid; }
${Object.entries(reportColors).map(([tone, color]) => `.safety-kpi-${tone} { background: #${color.fill}; border-top: 3px solid #${color.accent}; } .safety-kpi-${tone} h3, .safety-kpi-${tone} .safety-kpi-value { color: #${color.accent}; }`).join('\n')}
.safety-indicator-high { color: #c93636; background: #fdeeec; }
.safety-indicator-medium { color: #966009; background: #f8f2e7; }
.safety-indicator-low { color: #237443; background: #e8f3ef; }
.safety-indicator-badge { display: inline-block; padding: 4px 8px; border-radius: 12px; }
.incident-trend-scroll { overflow: visible; } .incident-trend-plot { min-width: 0 !important; }
.recharts-wrapper { max-width: 100%; height: auto !important; }
.recharts-surface { width: 100%; height: auto; } .recharts-legend-wrapper { position: static !important; max-width: 100%; }
.safety-kpi-value { font-size: 16pt; } small { display: block; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; } th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: left; vertical-align: top; }
thead { display: table-header-group; } tr { break-inside: avoid; }
details > summary { font-weight: bold; } section { margin-top: 18px; }
@media print { body { margin: 0; } button, nav, .safety-export, .safety-export-options { display: none !important; } }
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
