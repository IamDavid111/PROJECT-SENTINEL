import type { PermissionKey } from '../data/userManagementConfig'
import type { IconName } from '../lib/icons'
import type { AppRoute } from './routes'

export type Permission = PermissionKey

export const primaryNavigation: { route: AppRoute; label: string; icon: IconName; permission: Permission }[] = [
  { route: 'dashboard', label: 'Dashboard', icon: 'dashboard', permission: 'view_dashboard' },
  { route: 'report-incident', label: 'Report Incident', icon: 'reportIncident', permission: 'report_incident' },
  { route: 'inspections', label: 'Inspections', icon: 'inspections', permission: 'create_inspection' },
  { route: 'ai-assistant', label: 'AI Safety Assistant', icon: 'aiAssistant', permission: 'use_ai_assistant' },
  { route: 'knowledge', label: 'QHSE Knowledge', icon: 'knowledge', permission: 'view_knowledge_documents' },
  { route: 'executive-analytics', label: 'Executive Analytics', icon: 'executiveAnalytics', permission: 'view_executive_analytics' },
  { route: 'marketplace', label: 'HSE Marketplace', icon: 'marketplace', permission: 'view_marketplace' },
]

export const secondaryNavigation: { route: AppRoute; label: string; permission: PermissionKey }[] = [
  { route: 'profile', label: 'User Profile', permission: 'view_profile' },
  { route: 'preferences', label: 'Notification Preferences', permission: 'view_profile' },
  { route: 'activity-log', label: 'Activity Log', permission: 'view_activity' },
  { route: 'administration', label: 'Administration', permission: 'access_administration' },
  { route: 'settings', label: 'Settings', permission: 'manage_settings' },
  { route: 'my-reports', label: 'My Reports', permission: 'view_own_reports' },
  { route: 'assigned-actions', label: 'Assigned Actions', permission: 'view_own_reports' },
]

export const futureModuleRoutes: { route: AppRoute; label: string; permission: PermissionKey }[] = [
  { route: 'corrective-actions', label: 'Actions', permission: 'create_corrective_action' },
  { route: 'incidents', label: 'Incident Management', permission: 'view_all_incidents' },
  { route: 'incident-detail', label: 'Incident Detail', permission: 'view_all_incidents' },
  { route: 'audits', label: 'Audit Management', permission: 'view_dashboard' },
  { route: 'reports', label: 'Reports', permission: 'view_reports' },
  { route: 'users', label: 'User Management', permission: 'view_users' },
  { route: 'roles-permissions', label: 'Roles & Permissions', permission: 'view_roles_permissions' },
]