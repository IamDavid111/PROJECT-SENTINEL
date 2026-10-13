import type { SafetyPlanningIndicators } from '../../../supabase/functions/_shared/safetyPlanningIndicators'

export const initialPriorityLocationCount = 6

export function priorityPlanningLocations(outlook: SafetyPlanningIndicators) {
  return outlook.locations.filter((item) => item.indicator === 'High' || item.observedPriority === 'High'
    || item.location.backlogOpenHigh > 0 || item.location.overdueActions > 0)
    .sort((a, b) => b.location.backlogOpenCritical - a.location.backlogOpenCritical
      || b.location.overdueCriticalActions - a.location.overdueCriticalActions
      || b.location.backlogOpenHigh - a.location.backlogOpenHigh
      || b.location.overdueActions - a.location.overdueActions
      || b.location.recentHighRiskCount - a.location.recentHighRiskCount
      || a.location.name.localeCompare(b.location.name, 'en')
      || a.location.id.localeCompare(b.location.id, 'en'))
}
