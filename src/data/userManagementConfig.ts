export const USER_MANAGEMENT_ROLE_DEFINITIONS = [
  { id: 'organization_admin', name: 'Organization Admin', backendName: 'Organization Administrator' },
  { id: 'qhse_manager', name: 'QHSE Manager', backendName: 'QHSE Manager' },
  { id: 'site_supervisor', name: 'Site Supervisor', backendName: 'Site Supervisor' },
  { id: 'safety_hse_officer', name: 'Safety Officer / HSE Officer', backendName: 'Safety Officer / HSE Officer' },
  { id: 'worker', name: 'Worker', backendName: 'Field Worker' },
  { id: 'executive_management', name: 'Executive/Management', backendName: 'Executive / Management' },
  { id: 'contractor', name: 'Contractor', backendName: 'Contractor' },
  { id: 'maintenance_engineer', name: 'Maintenance Engineer', backendName: 'Maintenance Engineer' },
] as const

export type UserManagementRoleDefinition = typeof USER_MANAGEMENT_ROLE_DEFINITIONS[number]

export const USER_MANAGEMENT_ROLES = USER_MANAGEMENT_ROLE_DEFINITIONS.map((role) => role.name) as [
  UserManagementRoleDefinition['name'],
  ...UserManagementRoleDefinition['name'][]
]

export const BUILT_IN_BACKEND_ROLES = [
  'Super Administrator',
  ...USER_MANAGEMENT_ROLE_DEFINITIONS.map((role) => role.backendName),
  'Auditor',
] as const

export type UserManagementRole = typeof USER_MANAGEMENT_ROLES[number]

export const USER_MANAGEMENT_DEPARTMENTS = [
  'Operations',
  'HSE',
  'Maintenance',
  'Projects',
  'Human Resources',
  'Finance',
  'Procurement',
] as const

export type UserManagementDepartment = typeof USER_MANAGEMENT_DEPARTMENTS[number]

export const USER_STATUS_OPTIONS = ['Active', 'Inactive'] as const

export const USER_FILTER_STATUS_OPTIONS = ['All Statuses', 'Active', 'Pending', 'Suspended', 'Inactive'] as const

export const USER_ACTION_OPTIONS = ['Suspend', 'Deactivate'] as const

export type PermissionGroup = 'Dashboard' | 'Incident Management' | 'User Management' | 'Roles & Permissions' | 'Reports' | 'QHSE' | 'Administration' | 'Platform'

export type PermissionDefinition = {
  key: string
  label: string
  description: string
  group: PermissionGroup
}

export const USER_MANAGEMENT_PERMISSION_CATALOG = [
  { key: 'view_dashboard', label: 'View Dashboard', description: 'Allows access to the main SentinelQHSE dashboard.', group: 'Dashboard' },
  { key: 'view_kpis', label: 'View KPIs', description: 'Allows the user to view key performance indicators available to their account.', group: 'Dashboard' },
  { key: 'view_analytics', label: 'View Analytics', description: 'Allows access to available analytics views.', group: 'Dashboard' },
  { key: 'report_incident', label: 'Report Incident', description: 'Allows the user to submit an incident report.', group: 'Incident Management' },
  { key: 'view_own_reports', label: 'View Own Reports', description: 'Allows the user to view reports they personally submitted.', group: 'Incident Management' },
  { key: 'view_all_incidents', label: 'View All Incidents', description: 'Allows access to incidents submitted by users across the organization where supported.', group: 'Incident Management' },
  { key: 'manage_incidents', label: 'Manage Incidents', description: 'Allows authorized incident management actions where supported.', group: 'Incident Management' },
  { key: 'review_incidents', label: 'Review Incidents', description: 'Allows the user to review incident records where supported.', group: 'Incident Management' },
  { key: 'close_incidents', label: 'Close Incidents', description: 'Allows the user to close incident records where supported.', group: 'Incident Management' },
  { key: 'view_users', label: 'View Users', description: 'Allows access to the organization user list.', group: 'User Management' },
  { key: 'invite_users', label: 'Invite Users', description: 'Allows an authorized administrator to invite users.', group: 'User Management' },
  { key: 'edit_users', label: 'Edit Users', description: 'Allows authorized user account edits where supported.', group: 'User Management' },
  { key: 'suspend_users', label: 'Suspend Users', description: 'Allows authorized administrators to suspend users.', group: 'User Management' },
  { key: 'deactivate_users', label: 'Deactivate Users', description: 'Allows authorized administrators to deactivate users.', group: 'User Management' },
  { key: 'manage_user_roles', label: 'Manage User Roles', description: 'Allows an authorized administrator to assign roles to users.', group: 'User Management' },
  { key: 'view_roles_permissions', label: 'View Roles & Permissions', description: 'Allows access to the Roles & Permissions screen.', group: 'Roles & Permissions' },
  { key: 'manage_roles_permissions', label: 'Manage Roles & Permissions', description: 'Allows an authorized administrator to modify role permission assignments.', group: 'Roles & Permissions' },
  { key: 'view_all_reports', label: 'View All Reports', description: 'Allows access to organization reports where supported.', group: 'Reports' },
  { key: 'manage_reports', label: 'Manage Reports', description: 'Allows authorized report management actions where supported.', group: 'Reports' },
  { key: 'export_reports', label: 'Export Reports', description: 'Allows authorized report exports where supported.', group: 'Reports' },
  { key: 'manage_qhse', label: 'Manage QHSE', description: 'Allows authorized QHSE management actions where supported.', group: 'QHSE' },
  { key: 'manage_corrective_actions', label: 'Manage Corrective Actions', description: 'Allows authorized corrective-action management where supported.', group: 'QHSE' },
  { key: 'manage_facility_risks', label: 'Manage Facility Risks', description: 'Allows authorized facility-risk management where supported.', group: 'QHSE' },
  { key: 'access_administration', label: 'Access Administration', description: 'Allows access to the Administration area.', group: 'Administration' },
  { key: 'use_ai_assistant', label: 'Use AI Assistant', description: 'Allows access to the AI Safety Assistant.', group: 'Platform' },
  { key: 'view_executive_analytics', label: 'View Executive Analytics', description: 'Allows access to executive analytics views.', group: 'Dashboard' },
  { key: 'view_marketplace', label: 'View Marketplace', description: 'Allows access to the HSE Marketplace.', group: 'Platform' },
  { key: 'create_inspection', label: 'Create Inspection', description: 'Allows the user to create inspections where supported.', group: 'QHSE' },
  { key: 'create_corrective_action', label: 'Create Corrective Action', description: 'Allows the user to create corrective actions where supported.', group: 'QHSE' },
  { key: 'start_audit', label: 'Start Audit', description: 'Allows the user to start audits where supported.', group: 'QHSE' },
  { key: 'view_reports', label: 'View Reports', description: 'Allows access to available report views.', group: 'Reports' },
  { key: 'manage_users', label: 'Manage Users', description: 'Allows access to existing user-management administration features.', group: 'User Management' },
  { key: 'view_profile', label: 'View Profile', description: 'Allows access to the user profile area.', group: 'Platform' },
  { key: 'view_activity', label: 'View Activity', description: 'Allows access to organization activity logs where authorized.', group: 'Administration' },
  { key: 'manage_settings', label: 'Manage Settings', description: 'Allows authorized organization settings management.', group: 'Administration' },
] as const satisfies readonly PermissionDefinition[]

export type PermissionKey = typeof USER_MANAGEMENT_PERMISSION_CATALOG[number]['key']

export const BASELINE_PERMISSION_KEYS = [
  'view_dashboard',
  'view_kpis',
  'report_incident',
  'view_own_reports',
  'view_analytics',
] as const satisfies readonly PermissionKey[]

const withBaseline = (...permissions: PermissionKey[]): readonly PermissionKey[] => [
  ...BASELINE_PERMISSION_KEYS,
  ...permissions.filter((permission) => !BASELINE_PERMISSION_KEYS.includes(permission as typeof BASELINE_PERMISSION_KEYS[number])),
]

export const USER_MANAGEMENT_ROLE_PERMISSION_MATRIX: Record<UserManagementRole, readonly PermissionKey[]> = {
  'Organization Admin': withBaseline(
    'access_administration',
    'view_users',
    'invite_users',
    'edit_users',
    'suspend_users',
    'deactivate_users',
    'manage_user_roles',
    'view_roles_permissions',
    'manage_roles_permissions',
    'view_all_incidents',
    'manage_incidents',
    'view_all_reports',
    'export_reports',
    'manage_settings',
  ),
  'QHSE Manager': withBaseline(
    'view_all_incidents',
    'manage_incidents',
    'review_incidents',
    'close_incidents',
    'view_all_reports',
    'manage_reports',
    'manage_qhse',
    'manage_corrective_actions',
    'manage_facility_risks',
  ),
  'Site Supervisor': withBaseline(
    'view_all_incidents',
    'review_incidents',
    'view_all_reports',
    'manage_corrective_actions',
  ),
  'Safety Officer / HSE Officer': withBaseline(
    'view_all_incidents',
    'review_incidents',
    'manage_incidents',
    'view_all_reports',
    'manage_corrective_actions',
    'manage_facility_risks',
  ),
  Worker: withBaseline(),
  'Executive/Management': withBaseline(
    'view_all_incidents',
    'view_all_reports',
  ),
  Contractor: withBaseline(),
  'Maintenance Engineer': withBaseline(
    'view_all_incidents',
    'view_all_reports',
    'manage_corrective_actions',
  ),
}

export const SUPER_ADMINISTRATOR_PERMISSION_KEYS: readonly PermissionKey[] = USER_MANAGEMENT_PERMISSION_CATALOG.map((permission) => permission.key)

const LEGACY_ROLE_PERMISSION_KEYS: Record<string, readonly PermissionKey[]> = {
  'Organization Administrator': ['use_ai_assistant', 'view_executive_analytics', 'view_marketplace', 'create_inspection', 'create_corrective_action', 'start_audit', 'view_reports', 'view_profile', 'view_activity', 'manage_settings'],
  'QHSE Manager': ['use_ai_assistant', 'view_executive_analytics', 'view_marketplace', 'create_inspection', 'create_corrective_action', 'start_audit', 'view_reports', 'view_profile', 'view_activity'],
  'Site Supervisor': ['use_ai_assistant', 'create_inspection', 'create_corrective_action', 'view_profile'],
  'Safety Officer / HSE Officer': ['use_ai_assistant', 'create_inspection', 'create_corrective_action', 'start_audit', 'view_profile'],
  'Field Worker': ['use_ai_assistant', 'view_profile'],
  Contractor: ['use_ai_assistant', 'create_inspection', 'view_marketplace', 'view_profile'],
  'Executive / Management': ['use_ai_assistant', 'view_executive_analytics', 'view_reports', 'view_profile'],
  'Maintenance Engineer': ['use_ai_assistant', 'create_corrective_action', 'view_marketplace', 'view_profile'],
  Auditor: ['use_ai_assistant', 'view_executive_analytics', 'start_audit', 'view_reports', 'view_profile', 'view_activity'],
}

export function permissionsForRole(role: string, customPermissions: readonly string[] = []): readonly PermissionKey[] {
  if (role === 'Super Administrator') return SUPER_ADMINISTRATOR_PERMISSION_KEYS
  const displayRole = USER_MANAGEMENT_BACKEND_TO_ROLE[role]
  const backendPermissions = customPermissions.filter((permission): permission is PermissionKey => USER_MANAGEMENT_PERMISSION_CATALOG.some((definition) => definition.key === permission))
  if (!displayRole) return Array.from(new Set([...BASELINE_PERMISSION_KEYS, ...(LEGACY_ROLE_PERMISSION_KEYS[role] || []), ...backendPermissions]))
  return Array.from(new Set([
    ...USER_MANAGEMENT_ROLE_PERMISSION_MATRIX[displayRole],
    ...(LEGACY_ROLE_PERMISSION_KEYS[role] || []),
    ...backendPermissions,
  ]))
}

export function hasPermission(role: string, permission: PermissionKey, backendPermissions: readonly string[] = []) {
  return permissionsForRole(role, backendPermissions).includes(permission)
}

export function hasRolePermission(role: string, permission: PermissionKey, customPermissions: readonly string[] = []) {
  return permissionsForRole(role, customPermissions).includes(permission)
}

export const USER_MANAGEMENT_ROLE_TO_BACKEND: Record<UserManagementRole, string> = Object.fromEntries(
  USER_MANAGEMENT_ROLE_DEFINITIONS.map((role) => [role.name, role.backendName]),
) as Record<UserManagementRole, string>

export const USER_MANAGEMENT_ROLE_IDS: Record<UserManagementRole, string> = Object.fromEntries(
  USER_MANAGEMENT_ROLE_DEFINITIONS.map((role) => [role.name, role.id]),
) as Record<UserManagementRole, string>

export const USER_MANAGEMENT_BACKEND_TO_ROLE_ID: Record<string, string> = Object.fromEntries(
  USER_MANAGEMENT_ROLE_DEFINITIONS.map((role) => [role.backendName, role.id]),
)

export const USER_MANAGEMENT_BACKEND_TO_ROLE: Record<string, UserManagementRole> = Object.fromEntries(
  Object.entries(USER_MANAGEMENT_ROLE_TO_BACKEND).map(([displayRole, backendRole]) => [backendRole, displayRole as UserManagementRole]),
)
