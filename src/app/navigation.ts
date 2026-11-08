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

export const secondaryNavigation: { route: AppRoute; label: string; permission: PermissionKey; icon: IconName }[] = [
  { route: 'my-account', label: 'My Account', permission: 'view_profile', icon: 'profile' },
  { route: 'administration', label: 'Administration', permission: 'access_administration', icon: 'administration' },
  { route: 'settings', label: 'Settings', permission: 'manage_settings', icon: 'settings' },
  { route: 'my-workspace', label: 'My Workspace', permission: 'view_own_reports', icon: 'assignedActions' },
]

export const futureModuleRoutes: { route: AppRoute; label: string; permission: PermissionKey }[] = [
  { route: 'corrective-actions', label: 'Actions', permission: 'create_corrective_action' },
  { route: 'incidents', label: 'Incident Management', permission: 'view_all_incidents' },
  { route: 'incident-detail', label: 'Incident Detail', permission: 'view_all_incidents' },
  { route: 'users', label: 'User Management', permission: 'view_users' },
  { route: 'roles-permissions', label: 'Roles & Permissions', permission: 'view_roles_permissions' },
]