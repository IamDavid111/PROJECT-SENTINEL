import { getHashRoute } from './routing'

export type AppRoute = 'dashboard' | 'report-incident' | 'incident-detail' | 'my-reports' | 'assigned-actions' | 'my-account' | 'my-workspace' | 'ai-assistant' | 'knowledge' | 'executive-analytics' | 'marketplace' | 'incidents' | 'corrective-actions' | 'inspections' | 'administration' | 'users' | 'roles-permissions' | 'profile' | 'preferences' | 'activity-log' | 'settings' | 'policy-objectives-register' | 'legal-compliance-obligations-register'

// Read only the page name from the URL hash. For example, '#report-incident?draft=123' selects
// the incident form here; the form reads the draft ID from the query string separately.
// Unknown workspace hashes fall back to the dashboard.
export function getAppRoute(): AppRoute {
  const route = getHashRoute()
  if (route === 'profile' || route === 'preferences' || route === 'activity-log') return 'my-account'
  if (route === 'my-reports' || route === 'assigned-actions') return 'my-workspace'
  return route === 'report-incident' || route === 'incident-detail' || route === 'my-reports' || route === 'assigned-actions' || route === 'my-account' || route === 'my-workspace' || route === 'ai-assistant' || route === 'knowledge' || route === 'executive-analytics' || route === 'marketplace' || route === 'incidents' || route === 'corrective-actions' || route === 'inspections' || route === 'administration' || route === 'users' || route === 'roles-permissions' || route === 'profile' || route === 'preferences' || route === 'activity-log' || route === 'settings' || route === 'policy-objectives-register' || route === 'legal-compliance-obligations-register' ? route : 'dashboard'
}