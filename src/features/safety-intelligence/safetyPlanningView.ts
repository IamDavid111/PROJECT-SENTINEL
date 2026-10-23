import type { SafetyPlanningIndicators } from '../../../supabase/functions/_shared/safetyPlanningIndicators'

export const initialPriorityLocationCount = 6

export function priorityPlanningLocations(outlook: SafetyPlanningIndicators) {
  return outlook.locations.filter((item) => item.openCritical > 0 || item.criticalLinkedUnfinishedActions > 0
    || item.openHigh > 0 || item.nonOverdueUnfinishedActions > 0)
    .sort((a, b) => b.openCritical - a.openCritical
      || b.criticalLinkedUnfinishedActions - a.criticalLinkedUnfinishedActions
      || b.openHigh - a.openHigh
      || b.nonOverdueUnfinishedActions - a.nonOverdueUnfinishedActions
      || a.location.name.localeCompare(b.location.name, 'en')
      || a.location.id.localeCompare(b.location.id, 'en'))
}
