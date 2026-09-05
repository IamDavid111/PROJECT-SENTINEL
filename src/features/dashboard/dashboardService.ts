import type { SupabaseClient } from '@supabase/supabase-js'

import type { DashboardActivity, DashboardFilters, DashboardMetric, DashboardSnapshot } from './dashboardTypes'

const dateRangeDays: Record<DashboardFilters['dateRange'], number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  all: null,
}

function metadataText(metadata: Record<string, unknown>, key: string) {
  return typeof metadata[key] === 'string' ? metadata[key] : ''
}

function configuredNames(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string') return [item]
    if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string') return [item.name]
    return []
  })
}

function unavailableMetrics(): DashboardMetric[] {
  return [
    ['total-incidents', 'Total incidents', '▣', '#incidents', 'Incident Management'],
    ['open-incidents', 'Open incidents', '!', '#incidents', 'Incident Management'],
    ['resolved-incidents', 'Resolved incidents', '✓', '#incidents', 'Incident Management'],
    ['high-risk-incidents', 'High-risk incidents', '▲', '#incidents', 'Incident Management'],
    ['near-misses', 'Near misses', '◎', '#report-incident', 'Report Incident'],
    ['open-actions', 'Open corrective actions', '↗', '#corrective-actions', 'Corrective Actions'],
    ['overdue-actions', 'Overdue actions', '!', '#corrective-actions', 'Corrective Actions'],
    ['inspections-completed', 'Inspections completed', '✓', '#inspections', 'Safety Inspections'],
    ['pending-audits', 'Pending audits', '◌', '#audits', 'Audit Management'],
    ['safety-score', 'Safety score', '◈', '#executive-analytics', 'Executive Analytics'],
  ].map(([key, label, icon, href, module]) => ({
    key,
    label,
    value: 'Not yet available',
    detail: `Coming with ${module}`,
    icon,
    href,
    available: false,
    tone: key.includes('risk') || key.includes('overdue') ? 'orange' : 'neutral',
  }))
}

export async function getDashboardSnapshot(
  client: SupabaseClient,
  organizationId: string,
  filters: DashboardFilters,
): Promise<DashboardSnapshot> {
  const days = dateRangeDays[filters.dateRange]
  const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : null
  let activityQuery = client
    .from('activity_logs')
    .select('id, created_at, activity, user_id, location, metadata')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (since) activityQuery = activityQuery.gte('created_at', since)

  const { data, error } = await activityQuery
  if (error) throw new Error('Unable to load dashboard activity.')

  const { data: settings } = await client
    .from('company_settings')
    .select('departments, operational_sites, incident_categories')
    .eq('organization_id', organizationId)
    .maybeSingle()

  const filteredData = (data || []).filter((item) => {
    const metadata = (item.metadata || {}) as Record<string, unknown>
    const matches = (filter: string, key: string) => filter === 'all' || metadataText(metadata, key) === filter
    return matches(filters.site, 'site')
      && matches(filters.department, 'department')
      && matches(filters.severity, 'severity')
      && matches(filters.incidentType, 'incidentType')
      && matches(filters.contractor, 'contractor')
      && matches(filters.shift, 'shift')
  })
  const userIds = [...new Set(filteredData.map((item) => item.user_id).filter((id): id is string => Boolean(id)))]
  const { data: profiles } = userIds.length
    ? await client.from('profiles').select('id, full_name').in('id', userIds)
    : { data: [] as { id: string; full_name: string }[] }
  const userNames = new Map((profiles || []).map((profile) => [profile.id, profile.full_name]))
  const activities = filteredData.map((item) => ({
    id: item.id,
    createdAt: item.created_at,
    activity: item.activity,
    userId: item.user_id,
    userName: item.user_id ? userNames.get(item.user_id) || 'Organization user' : 'System',
    location: item.location || metadataText((item.metadata || {}) as Record<string, unknown>, 'site') || 'Organization-wide',
    metadata: (item.metadata || {}) as Record<string, unknown>,
  })) as DashboardActivity[]

  return {
    activities,
    metrics: unavailableMetrics(),
    incidentTrend: [],
    incidentSeverity: [],
    incidentTypes: [],
    departmentComparison: [],
    siteComparison: [],
    correctiveActions: [],
    inspections: null,
    sites: [],
    configuredIncidentTypes: configuredNames(settings?.incident_categories),
    configuredDepartments: configuredNames(settings?.departments),
    configuredSites: configuredNames(settings?.operational_sites),
    hasOperationalData: false,
  }
}
