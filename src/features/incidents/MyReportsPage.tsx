import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { useIncidents } from './useIncidentData'
import { incidentReportTypes, incidentStatuses, type IncidentListFilters, type IncidentStatus } from './incidentTypes'

const pageSize = 10

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'Not submitted'
}

function incidentHref(id: string, status: IncidentStatus) {
  return status === 'draft' ? `#report-incident?draft=${id}` : `#incident-detail?id=${id}`
}

function StatusBadge({ status }: { status: IncidentStatus }) {
  return <span className={`incident-status-badge status-${status}`}>{label(status)}</span>
}

export function MyReportsPage({ supabase }: { supabase: SupabaseClient }) {
  const [filters, setFilters] = useState<IncidentListFilters>({ status: 'all', reportType: 'all', page: 1, pageSize })
  const incidents = useIncidents(supabase, filters)
  const totalPages = incidents.data ? Math.max(1, Math.ceil(incidents.data.total / pageSize)) : 1
  const updateFilter = (key: keyof IncidentListFilters, value: string) => setFilters((current) => ({ ...current, [key]: value || undefined, page: 1 }))
  const resetFilters = () => setFilters({ status: 'all', reportType: 'all', page: 1, pageSize })

  return <div className="my-reports-page"><div className="my-reports-header"><div><div className="eyebrow">REPORT INCIDENT</div><h2>My Reports</h2><p>Review incident and near-miss reports created within your organization.</p></div><a className="button button-green button-small" href="#report-incident">＋ Report incident</a></div><div className="reports-toolbar"><label>Search<input value={filters.search || ''} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Reference, title, or location" /></label><label>Status<select value={filters.status || 'all'} onChange={(event) => updateFilter('status', event.target.value)}><option value="all">All statuses</option>{incidentStatuses.map((status) => <option value={status} key={status}>{label(status)}</option>)}</select></label><label>Report type<select value={filters.reportType || 'all'} onChange={(event) => updateFilter('reportType', event.target.value)}><option value="all">All types</option>{incidentReportTypes.map((type) => <option value={type} key={type}>{label(type)}</option>)}</select></label><label>From<input type="date" value={filters.dateFrom || ''} onChange={(event) => updateFilter('dateFrom', event.target.value)} /></label><label>To<input type="date" value={filters.dateTo || ''} onChange={(event) => updateFilter('dateTo', event.target.value)} /></label><button className="button button-outline reports-clear" type="button" onClick={resetFilters}>Clear</button></div>{incidents.isLoading ? <div className="workspace-empty">Loading your reports...</div> : incidents.isError ? <div className="auth-message error" role="alert">Unable to load reports. Please try again.</div> : incidents.data?.items.length ? <><div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Reference</th><th>Title</th><th>Type</th><th>Occurrence date</th><th>Location</th><th>Severity</th><th>Status</th><th>Submitted</th></tr></thead><tbody>{incidents.data.items.map((incident) => <tr key={incident.id}><td><a href={incidentHref(incident.id, incident.status)} className="report-reference">{incident.referenceNumber}</a></td><td><a href={incidentHref(incident.id, incident.status)}>{incident.title}</a></td><td>{label(incident.reportType)}</td><td>{formatDate(incident.occurredAt)}</td><td>{incident.location || 'Not set'}</td><td>{incident.severity || incident.potentialSeverity || 'Not set'}</td><td><StatusBadge status={incident.status} /></td><td>{formatDate(incident.reportedAt)}</td></tr>)}</tbody></table></div><div className="reports-pagination"><span>Page {filters.page || 1} of {totalPages} · {incidents.data.total} reports</span><div><button className="button button-outline button-small" type="button" disabled={(filters.page || 1) <= 1} onClick={() => setFilters((current) => ({ ...current, page: (current.page || 1) - 1 }))}>Previous</button><button className="button button-outline button-small" type="button" disabled={(filters.page || 1) >= totalPages} onClick={() => setFilters((current) => ({ ...current, page: (current.page || 1) + 1 }))}>Next</button></div></div></> : <div className="workspace-empty"><strong>No incident reports found.</strong><span>Start by reporting your first incident.</span><a className="button button-green button-small" href="#report-incident">Report incident</a></div>}</div>
}
