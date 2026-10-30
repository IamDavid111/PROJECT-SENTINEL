import { USER_MANAGEMENT_BACKEND_TO_ROLE, USER_MANAGEMENT_PERMISSION_CATALOG } from '../../../data/userManagementConfig'
import type { Permission } from '../../../app/navigation'
import type { ManagedUser, ManagedUserFilters } from './types'

export function matchesManagedUserFilters(user: ManagedUser, filters: ManagedUserFilters) {
  const displayRole = USER_MANAGEMENT_BACKEND_TO_ROLE[user.role] || user.role
  const searchableText = `${user.id} ${user.full_name} ${user.employee_id || ''} ${user.department || ''} ${user.role} ${displayRole}`.toLowerCase()
  const matchesQuery = searchableText.includes(filters.query.trim().toLowerCase())
  const matchesRole = filters.role === 'all' || user.role === filters.role
  const matchesDepartment = filters.department === 'all'
    || (filters.department === '__unset__' ? !user.department : user.department === filters.department)
  const matchesStatus = filters.status === 'all' || user.account_status === filters.status
  return matchesQuery && matchesRole && matchesDepartment && matchesStatus
}

export function getDepartmentLabel(department: string | null) {
  return department?.trim() || 'Department not set'
}

export const permissionCatalog: Permission[] = USER_MANAGEMENT_PERMISSION_CATALOG.map((permission) => permission.key)

export type CustomRoleRecord = {
  id?: string
  organization_id?: string
  name: string
  description?: string | null
  permissions: string[]
  scope?: Record<string, unknown> | null
  is_system?: boolean
  is_active?: boolean
  created_by?: string | null
  created_at?: string | null
  updated_at?: string | null
}

