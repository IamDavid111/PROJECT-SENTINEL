export const USER_MANAGEMENT_ROLES = [
  'Organization Admin',
  'QHSE Manager',
  'Site Supervisor',
  'Safety Officer / HSE Officer',
  'Worker',
  'Executive/Management',
  'Contractor',
  'Maintenance Engineer',
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

export const USER_MANAGEMENT_ROLE_TO_BACKEND: Record<UserManagementRole, string> = {
  'Organization Admin': 'Organization Administrator',
  'QHSE Manager': 'QHSE Manager',
  'Site Supervisor': 'Site Supervisor',
  'Safety Officer / HSE Officer': 'Safety Officer / HSE Officer',
  Worker: 'Field Worker',
  'Executive/Management': 'Executive / Management',
  Contractor: 'Contractor',
  'Maintenance Engineer': 'Maintenance Engineer',
}

export const USER_MANAGEMENT_BACKEND_TO_ROLE: Record<string, UserManagementRole> = Object.fromEntries(
  Object.entries(USER_MANAGEMENT_ROLE_TO_BACKEND).map(([displayRole, backendRole]) => [backendRole, displayRole as UserManagementRole]),
)
