import type { SafetyIncidentTrend } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'

export const incidentTrendViews = [
  { value: 'month', label: 'By Month', axis: 'Month' },
  { value: 'week', label: 'By Week', axis: 'Week starting Monday' },
  { value: 'site', label: 'By Site', axis: 'Site' },
  { value: 'department', label: 'By Department', axis: 'Department' },
  { value: 'severity', label: 'By Severity', axis: 'Effective severity' },
  { value: 'category', label: 'By Incident Category', axis: 'Incident category' },
] as const
export type IncidentTrendView = (typeof incidentTrendViews)[number]['value']
export type IncidentTrendPoint = { key: string; label: string; incidents: number; nearMisses: number; closed: number }

export function groupIncidentTrend(data: SafetyIncidentTrend, view: IncidentTrendView) {
  const buckets = new Map<string, IncidentTrendPoint>()
  const order = new Map<string, number>()
  const sites = new Map(data.settings.sites.map((site) => [site.id, site.name]))
  const configured = view === 'department' ? data.settings.departments
    : view === 'severity' ? data.settings.severities : data.settings.categories
  let omitted = 0
  const seen = new Set<string>()
  for (const record of data.records) {
    if (seen.has(record.id)) continue
    seen.add(record.id)
    const contributions: { series: 'incidents' | 'nearMisses' | 'closed'; at: string }[] = []
    if (record.reportedAt) {
      // "Incidents" covers every non-near-miss report type, matching the dashboard.
      contributions.push({ series: record.reportType === 'near_miss' ? 'nearMisses' : 'incidents', at: record.reportedAt })
    }
    if (record.closedAt) contributions.push({ series: 'closed', at: record.closedAt })
    for (const contribution of contributions) {
      let key: string | undefined
      let label: string | undefined
      let position = 0
      if (view === 'month' || view === 'week') {
        const date = new Date(contribution.at)
        if (!Number.isFinite(date.getTime())) throw new Error('Incident trend contains an invalid date.')
        if (view === 'month') {
          date.setDate(1)
          date.setHours(0, 0, 0, 0)
          label = date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
        } else {
          date.setDate(date.getDate() - (date.getDay() + 6) % 7)
          date.setHours(0, 0, 0, 0)
          label = `Week of ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
        }
        position = date.getTime()
        key = String(position)
      } else if (view === 'site') {
        const siteId = record.siteId
        const siteName = siteId ? sites.get(siteId) : undefined
        if (siteName) {
          label = siteName
          key = siteId ?? undefined
          position = data.settings.sites.findIndex((site) => site.id === key)
        } else {
          label = 'Unassigned'
          key = '__unassigned'
          position = data.settings.sites.length
        }
      } else {
        const value = view === 'department' ? record.department : view === 'severity' ? record.severity : record.category
        const index = value?.trim() ? configured.findIndex((name) => name.toLowerCase() === value.trim().toLowerCase()) : -1
        if (index >= 0) {
          label = configured[index]
          key = label.toLowerCase()
          position = index
        } else {
          // Keep unmatched values visible instead of dropping them from the total.
          label = view === 'severity' ? 'Unclassified' : 'Unassigned'
          key = label.toLowerCase()
          position = configured.length
        }
      }
      if (!key || !label) {
        omitted++
        continue
      }
      const bucket = buckets.get(key) ?? { key, label, incidents: 0, nearMisses: 0, closed: 0 }
      bucket[contribution.series]++
      buckets.set(key, bucket)
      order.set(key, position)
    }
  }
  return {
    points: [...buckets.values()].sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0)),
    omitted,
  }
}
