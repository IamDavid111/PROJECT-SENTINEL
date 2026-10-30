

import { USER_MANAGEMENT_PERMISSION_CATALOG } from '../../../data/userManagementConfig'
import type { CustomRoleRecord } from '../users/userHelpers'

export type RoleSummary = {
  name: string
  description: string
  permissions: readonly string[]
  isSystem: boolean
  customRole?: CustomRoleRecord
}

export const permissionGroupOrder = [
  { label: 'Platform Access', sourceGroups: ['Dashboard', 'Platform', 'Administration'] },
  { label: 'Incident Management', sourceGroups: ['Incident Management'] },
  { label: 'User Management', sourceGroups: ['User Management'] },
  { label: 'Roles & Permissions', sourceGroups: ['Roles & Permissions'] },
  { label: 'Reports', sourceGroups: ['Reports'] },
  { label: 'QHSE', sourceGroups: ['QHSE'] },
  { label: 'QHSE Knowledge', sourceGroups: ['QHSE Knowledge'] },
] as const

export function groupedPermissions(permissions: readonly string[]) {
  return permissionGroupOrder.map((group) => ({
    group: group.label,
    permissions: USER_MANAGEMENT_PERMISSION_CATALOG.filter((permission) => (group.sourceGroups as readonly string[]).includes(permission.group) && permissions.includes(permission.key)),
  })).filter((section) => section.permissions.length > 0)
}

export const roleDescriptions: Record<string, string> = {
  'Organization Admin': 'Manage organization users, access controls, roles and settings.',
  'QHSE Manager': 'Review and manage QHSE incidents, reports and corrective actions.',
  'Site Supervisor': 'Oversee site operations, incidents and corrective actions.',
  'Safety Officer / HSE Officer': 'Manage safety operations, incidents and facility risks.',
  Worker: 'Access core dashboard, analytics and personal reporting workflows.',
  'Executive/Management': 'Review organization-level operational visibility and reports.',
  Contractor: 'Access core operational reporting and personal work information.',
  'Maintenance Engineer': 'Review operational records and maintenance-related actions.',
}

// Show the platform's built-in roles beside custom roles created for this organization.
// Built-in roles are view-only here; choosing an editable custom role opens the separate role editor.
