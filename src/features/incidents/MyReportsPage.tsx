import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { useIncidentOrganization, useIncidents } from './useIncidentData'
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
  const organization = useIncidentOrganization(supabase)
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([])
  const [filters, setFilters] = useState<IncidentListFilters>({ status: 'all', reportType: 'all', severity: 'all', siteId: 'all', page: 1, pageSize })
  const incidents = useIncidents(supabase, filters)
  useEffect(() => {
    if (!organization.data?.organizationId) return
    void supabase.from('sites').select('id, name').eq('organization_id', organization.data.organizationId).order('name').then(({ data }) => setSites(data || []))
  }, [organization.data?.organizationId, supabase])
  const totalPages = incidents.data ? Math.max(1, Math.ceil(incidents.data.total / pageSize)) : 1
  const updateFilter = (key: keyof IncidentListFilters, value: string) => setFilters((current) => ({ ...current, [key]: value || undefined, page: 1 }))
  const resetFilters = () => setFilters({ status: 'all', reportType: 'all', severity: 'all', siteId: 'all', page: 1, pageSize })

  return <div className="my-reports-page"><div className="my-reports-header"><div><div className="eyebrow">OPERATIONS & QHSE</div><h2>Incident Management</h2><p>{incidents.data?.total || 0} incidents match the current filters.</p></div><div className="incident-management-actions"><button className="button button-outline button-small" type="button" onClick={() => window.print()}>Export</button><a className="button button-green button-small" href="#report-incident">＋ Report incident</a></div></div><div className="reports-toolbar"><label>Search<input value={filters.search || ''} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search reference, title, reporter, site..." /></label><label>Severity<select value={filters.severity || 'all'} onChange={(event) => updateFilter('severity', event.target.value)}><option value="all">All severity</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label><label>Status<select value={filters.status || 'all'} onChange={(event) => updateFilter('status', event.target.value)}><option value="all">All status</option>{incidentStatuses.map((status) => <option value={status} key={status}>{label(status)}</option>)}</select></label><label>Site<select value={filters.siteId || 'all'} onChange={(event) => updateFilter('siteId', event.target.value)}><option value="all">All site</option>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select></label><label>Category<select value={filters.reportType || 'all'} onChange={(event) => updateFilter('reportType', event.target.value)}><option value="all">All category</option>{incidentReportTypes.map((type) => <option value={type} key={type}>{label(type)}</option>)}</select></label><button className="button button-outline reports-clear" type="button" onClick={resetFilters}>Reset</button></div>{incidents.isLoading ? <div className="workspace-empty">Loading incidents...</div> : incidents.isError ? <div className="auth-message error" role="alert">Unable to load incidents. Please try again.</div> : incidents.data?.items.length ? <><div className="reports-table-wrap"><table className="reports-table"><thead><tr><th>Reference</th><th>Incident</th><th>Category</th><th>Severity</th><th>Status</th><th>Site</th><th>Assignee</th><th>Date</th></tr></thead><tbody>{incidents.data.items.map((incident) => <tr key={incident.id}><td><a href={incidentHref(incident.id, incident.status)} className="report-reference">{incident.referenceNumber}</a></td><td><a href={incidentHref(incident.id, incident.status)}>{incident.title}</a><small className="report-subline">Reported by {incident.createdBy}</small></td><td>{incident.incidentCategory || label(incident.reportType)}</td><td>{incident.severity || incident.potentialSeverity || 'Not set'}</td><td><StatusBadge status={incident.status} /></td><td>{sites.find((site) => site.id === incident.siteId)?.name || 'Not set'}</td><td>Unassigned</td><td>{formatDate(incident.occurredAt)}</td></tr>)}</tbody></table></div><div className="reports-pagination"><span>Page {filters.page || 1} of {totalPages} · {incidents.data.total} incidents</span><div><button className="button button-outline button-small" type="button" disabled={(filters.page || 1) <= 1} onClick={() => setFilters((current) => ({ ...current, page: (current.page || 1) - 1 }))}>Previous</button><button className="button button-outline button-small" type="button" disabled={(filters.page || 1) >= totalPages} onClick={() => setFilters((current) => ({ ...current, page: (current.page || 1) + 1 }))}>Next</button></div></div></> : <div className="workspace-empty"><strong>No incident reports found.</strong><span>Start by reporting your first incident.</span><a className="button button-green button-small" href="#report-incident">Report incident</a></div>}</div>
}
