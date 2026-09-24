import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import ExcelJS from 'exceljs'
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'

import { useIncidentOrganization, useIncidents } from './useIncidentData'
import { incidentStatuses, type IncidentListFilters, type IncidentListScope, type IncidentStatus, type IncidentSummary } from './incidentTypes'

const pageSize = 10

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'Not submitted'
}

function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not submitted'
}

function incidentHref(id: string, status: IncidentStatus) {
  return status === 'draft' ? `#report-incident?draft=${id}` : `#incident-detail?id=${id}`
}

function StatusBadge({ status }: { status: IncidentStatus }) {
  return <span className={`incident-status-badge status-${status}`}>{label(status)}</span>
}

function activeSettingNames(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : []
    if (!item || typeof item !== 'object') return []
    const entry = item as { name?: unknown; active?: unknown }
    return typeof entry.name === 'string' && entry.name.trim() && entry.active !== false ? [entry.name.trim()] : []
  })
}

type ExportFormat = 'xlsx' | 'pdf' | 'docx'

type IncidentExportRow = {
  reference: string
  title: string
  category: string
  severity: string
  status: string
  site: string
  department: string
  occurredAt: string
  submittedAt: string
  reporter: string
  location: string
}

function downloadExport(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function exportRows(items: IncidentSummary[], sites: Array<{ id: string; name: string }>): IncidentExportRow[] {
  return items.map((incident) => ({
    reference: incident.referenceNumber,
    title: incident.title,
    category: incident.incidentCategory || label(incident.reportType),
    severity: incident.severity || incident.potentialSeverity || 'Not set',
    status: label(incident.status),
    site: sites.find((site) => site.id === incident.siteId)?.name || 'Not set',
    department: incident.department || 'Not set',
    occurredAt: formatDate(incident.occurredAt),
    submittedAt: formatDateTime(incident.reportedAt),
    reporter: incident.createdBy,
    location: incident.location || 'Not set',
  }))
}

function exportFileName(format: ExportFormat, date: Date) {
  return `SentinelQHSE_Incident_Management_${date.toISOString().slice(0, 10)}.${format}`
}

function exportCsvLikeRows(rows: IncidentExportRow[]) {
  return rows.map((row) => [row.reference, row.title, row.category, row.severity, row.status, row.site, row.department, row.occurredAt, row.submittedAt, row.reporter, row.location])
}

function exportPdf(rows: IncidentExportRow[], generatedAt: Date, administrator: string) {
  const pdf = new jsPDF({ orientation: 'landscape' })
  pdf.setTextColor('#0f172a')
  pdf.setFontSize(18)
  pdf.text('SentinelQHSE', 14, 16)
  pdf.setFontSize(14)
  pdf.text('Incident Management Register', 14, 25)
  pdf.setFontSize(9)
  pdf.setTextColor('#475569')
  pdf.text('Filtered incident records currently visible to the authenticated user.', 14, 33)
  pdf.text(`Exported: ${generatedAt.toLocaleString()} | Records: ${rows.length}`, 14, 40)
  autoTable(pdf, {
    startY: 48,
    head: [['Reference', 'Title', 'Category', 'Severity', 'Status', 'Site', 'Department', 'Occurred', 'Submitted', 'Reporter', 'Location']],
    body: exportCsvLikeRows(rows),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [15, 74, 62] },
  })
  const finalY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 48
  pdf.setTextColor('#0f172a')
  pdf.setFontSize(9)
  pdf.text('AUTHORIZED EXPORT — ADMINISTRATOR SIGN-OFF', 14, finalY + 15)
  pdf.setFontSize(8)
  pdf.text(`Authorized / Exported By: ${administrator}`, 14, finalY + 22)
  pdf.text(`Date and Time of Export: ${generatedAt.toLocaleString()}`, 14, finalY + 29)
  pdf.save(exportFileName('pdf', generatedAt))
}

async function exportExcel(rows: IncidentExportRow[], generatedAt: Date, administrator: string) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Incident Register')
  sheet.mergeCells('A1:K1')
  sheet.getCell('A1').value = 'SentinelQHSE — Incident Management Register'
  sheet.getCell('A1').font = { bold: true, size: 16, color: { argb: '0F172A' } }
  sheet.mergeCells('A2:K2')
  sheet.getCell('A2').value = 'Filtered incident records currently visible to the authenticated user.'
  sheet.getCell('A3').value = 'Exported'
  sheet.getCell('B3').value = generatedAt.toLocaleString()
  sheet.getCell('D3').value = 'Records'
  sheet.getCell('E3').value = rows.length
  const header = sheet.addRow(['Reference', 'Title', 'Category', 'Severity', 'Status', 'Site', 'Department', 'Occurred', 'Submitted', 'Reporter', 'Location'])
  header.font = { bold: true, color: { argb: 'FFFFFF' } }
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F4A3E' } }
  rows.forEach((row) => sheet.addRow(exportCsvLikeRows([row])[0]))
  sheet.addRow([])
  sheet.addRow(['AUTHORIZED EXPORT — ADMINISTRATOR SIGN-OFF'])
  sheet.addRow(['Authorized / Exported By', administrator])
  sheet.addRow(['Date and Time of Export', generatedAt.toLocaleString()])
  sheet.columns = [{ width: 18 }, { width: 30 }, { width: 22 }, { width: 14 }, { width: 18 }, { width: 22 }, { width: 20 }, { width: 16 }, { width: 24 }, { width: 28 }, { width: 24 }]
  sheet.eachRow((row) => row.eachCell((cell) => { cell.alignment = { ...cell.alignment, vertical: 'top', wrapText: true } }))
  const buffer = await workbook.xlsx.writeBuffer()
  downloadExport(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), exportFileName('xlsx', generatedAt))
}

async function exportWord(rows: IncidentExportRow[], generatedAt: Date, administrator: string) {
  const headers = ['Reference', 'Title', 'Category', 'Severity', 'Status', 'Site', 'Department', 'Occurred', 'Submitted', 'Reporter', 'Location']
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map((value) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: value, bold: true })] })] })) }),
      ...rows.map((row) => new TableRow({ children: exportCsvLikeRows([row])[0].map((value) => new TableCell({ children: [new Paragraph(value)] })) })),
    ],
  })
  const document = new Document({ sections: [{ children: [
    new Paragraph({ text: 'SentinelQHSE', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ text: 'Incident Management Register', heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: 'Filtered incident records currently visible to the authenticated user.' }),
    new Paragraph({ text: `Exported: ${generatedAt.toLocaleString()} | Records: ${rows.length}` }),
    table,
    new Paragraph({ text: 'AUTHORIZED EXPORT — ADMINISTRATOR SIGN-OFF', heading: HeadingLevel.HEADING_2, spacing: { before: 360 } }),
    new Paragraph({ text: `Authorized / Exported By: ${administrator}` }),
    new Paragraph({ text: `Date and Time of Export: ${generatedAt.toLocaleString()}` }),
  ] }] })
  const buffer = await Packer.toBlob(document)
  downloadExport(buffer, exportFileName('docx', generatedAt))
}

export function MyReportsPage({ supabase, canExport = false, scope = 'organization' }: { supabase: SupabaseClient; canExport?: boolean; scope?: IncidentListScope }) {
  const organization = useIncidentOrganization(supabase)
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([])
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [exportFormat, setExportFormat] = useState<ExportFormat>('xlsx')
  const [exportLoading, setExportLoading] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const [exportError, setExportError] = useState('')
  const [administrator, setAdministrator] = useState('Authenticated user')
  const [filters, setFilters] = useState<IncidentListFilters>({ status: 'all', incidentCategory: 'all', severity: 'all', siteId: 'all', department: 'all', page: 1, pageSize })
  const incidents = useIncidents(supabase, filters, scope)

  useEffect(() => {
    if (!organization.data?.organizationId) return
    void Promise.all([
      supabase.from('sites').select('id, name').eq('organization_id', organization.data.organizationId).order('name'),
      supabase.from('company_settings').select('departments, operational_sites, incident_categories, severity_levels').eq('organization_id', organization.data.organizationId).maybeSingle(),
    ]).then(([siteResult, settingsResult]) => {
      setSettings(settingsResult.data || {})
      const configuredSiteNames = activeSettingNames(settingsResult.data?.operational_sites)
      setSites((siteResult.data || []).filter((site) => configuredSiteNames.some((name) => name.toLowerCase() === site.name.toLowerCase())))
    })
  }, [organization.data?.organizationId, supabase])

  useEffect(() => {
    if (!organization.data?.userId) return
    void supabase.from('profiles').select('full_name').eq('id', organization.data.userId).maybeSingle().then(({ data }) => {
      if (data?.full_name) setAdministrator(data.full_name)
    })
  }, [organization.data?.userId, supabase])

  const categories = activeSettingNames(settings.incident_categories)
  const severities = activeSettingNames(settings.severity_levels)
  const departments = activeSettingNames(settings.departments)
  const totalPages = incidents.data ? Math.max(1, Math.ceil(incidents.data.total / pageSize)) : 1
  const updateFilter = (key: keyof IncidentListFilters, value: string) => setFilters((current) => ({ ...current, [key]: value || undefined, page: 1 }))
  const resetFilters = () => setFilters({ status: 'all', incidentCategory: 'all', severity: 'all', siteId: 'all', department: 'all', page: 1, pageSize })
  const exportIncidents = async () => {
    if (!canExport || !incidents.data) return
    setExportLoading(true)
    setExportError('')
    setExportMessage('')
    const generatedAt = new Date()
    const rows = exportRows(incidents.data.items, sites)
    try {
      if (exportFormat === 'xlsx') await exportExcel(rows, generatedAt, administrator)
      if (exportFormat === 'pdf') exportPdf(rows, generatedAt, administrator)
      if (exportFormat === 'docx') await exportWord(rows, generatedAt, administrator)
      setExportMessage(`${exportFormat.toUpperCase()} incident register downloaded.`)
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Unable to generate the incident export.')
    } finally {
      setExportLoading(false)
    }
  }

  return (
    <div className="my-reports-page">
      <div className="my-reports-header">
        <div><div className="eyebrow">OPERATIONS &amp; QHSE</div><h2>Incident Management</h2><p>{incidents.data?.total || 0} incidents match the current filters.</p></div>
        <div className="incident-management-actions">{canExport && <><select className="export-format-select" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)} aria-label="Incident export format"><option value="xlsx">Excel</option><option value="pdf">PDF</option><option value="docx">Word</option></select><button className="button button-outline button-small" type="button" onClick={() => void exportIncidents()} disabled={exportLoading || !incidents.data}>{exportLoading ? 'Generating...' : 'Export incidents'}</button></>}<a className="button button-green button-small" href="#report-incident">Report incident</a></div>
      </div>
      {exportError && <div className="auth-message error" role="alert">{exportError}</div>}
      {exportMessage && <div className="auth-message success" role="status">{exportMessage}</div>}
      <div className="reports-toolbar">
        <label>Search<input value={filters.search || ''} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search reference, title, reporter, site..." /></label>
        <label>Severity<select value={filters.severity || 'all'} onChange={(event) => updateFilter('severity', event.target.value)}><option value="all">All configured severity</option>{severities.map((severity) => <option value={severity} key={severity}>{severity}</option>)}</select></label>
        <label>Status<select value={filters.status || 'all'} onChange={(event) => updateFilter('status', event.target.value)}><option value="all">All status</option>{incidentStatuses.map((status) => <option value={status} key={status}>{label(status)}</option>)}</select></label>
        <label>Site<select value={filters.siteId || 'all'} onChange={(event) => updateFilter('siteId', event.target.value)}><option value="all">All configured sites</option>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label>
        <label>Department<select value={filters.department || 'all'} onChange={(event) => updateFilter('department', event.target.value)}><option value="all">All configured departments</option>{departments.map((department) => <option value={department} key={department}>{department}</option>)}</select></label>
        <label>Category<select value={filters.incidentCategory || 'all'} onChange={(event) => updateFilter('incidentCategory', event.target.value)}><option value="all">All configured categories</option>{categories.map((category) => <option value={category} key={category}>{category}</option>)}</select></label>
        <button className="button button-outline reports-clear" type="button" onClick={resetFilters}>Reset</button>
      </div>
      {incidents.isLoading ? <div className="workspace-empty">Loading incidents...</div> : incidents.isError ? <div className="auth-message error" role="alert">Unable to load incidents. Please try again.</div> : incidents.data?.items.length ? <>
        <div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Reference</th><th>Incident</th><th>Category</th><th>Severity</th><th>Status</th><th>Site</th><th>Department</th><th>Assignee</th><th>Occurred</th><th>Submitted</th></tr></thead><tbody>
          {incidents.data.items.map((incident) => <tr key={incident.id}><td><a href={incidentHref(incident.id, incident.status)} className="report-reference">{incident.referenceNumber}</a></td><td><a href={incidentHref(incident.id, incident.status)}>{incident.title}</a><small className="report-subline">Reported by {incident.createdBy}</small></td><td>{incident.incidentCategory || label(incident.reportType)}</td><td>{incident.severity || incident.potentialSeverity || 'Not set'}</td><td><StatusBadge status={incident.status} /></td><td>{sites.find((site) => site.id === incident.siteId)?.name || 'Not set'}</td><td>{incident.department || 'Not set'}</td><td>Unassigned</td><td>{formatDate(incident.occurredAt)}</td><td>{formatDateTime(incident.reportedAt)}</td></tr>)}
        </tbody></table></div>
        <div className="reports-pagination"><span>Page {filters.page || 1} of {totalPages} · {incidents.data.total} incidents</span><div><button className="button button-outline button-small" type="button" disabled={(filters.page || 1) <= 1} onClick={() => setFilters((current) => ({ ...current, page: (current.page || 1) - 1 }))}>Previous</button><button className="button button-outline button-small" type="button" disabled={(filters.page || 1) >= totalPages} onClick={() => setFilters((current) => ({ ...current, page: (current.page || 1) + 1 }))}>Next</button></div></div>
      </> : <div className="workspace-empty"><strong>No incident reports found.</strong><span>Start by reporting your first incident.</span><a className="button button-green button-small" href="#report-incident">Report incident</a></div>}
    </div>
  )
}
