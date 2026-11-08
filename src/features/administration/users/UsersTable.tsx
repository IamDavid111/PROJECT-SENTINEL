import { Avatar, Badge, Button, DataTable, Select, type DataTableColumn } from '../../../components/ui'
import { USER_ACTION_OPTIONS } from '../../../data/userManagementConfig'
import { getDepartmentLabel } from './userHelpers'
import type { ManagedUser } from './types'

export function UsersTable({ users, loading, roleOptions, roleLabels, currentUserId, canManageUserRoles, canEditUsers, canSuspendUsers, canDeactivateUsers, canAppointSuperAdmins, canRemoveSuperAdmins, originalSuperAdminId, superAdminCount, onUpdate, onAppointSuperAdmin, onRemoveSuperAdmin }: {
  users: ManagedUser[]
  loading: boolean
  roleOptions: Array<{ id: string; label: string; value: string }>
  roleLabels: Record<string, string>
  currentUserId: string
  canManageUserRoles: boolean
  canEditUsers: boolean
  canSuspendUsers: boolean
  canDeactivateUsers: boolean
  canAppointSuperAdmins: boolean
  canRemoveSuperAdmins: boolean
  originalSuperAdminId: string | null
  superAdminCount: number
  onUpdate: (user: ManagedUser, field: 'role' | 'account_status', value: string) => void
  onAppointSuperAdmin: (user: ManagedUser) => void
  onRemoveSuperAdmin: (user: ManagedUser) => void
}) {
  const actionOptions = USER_ACTION_OPTIONS.filter((action) => action === 'Suspend' ? canSuspendUsers : canDeactivateUsers)

  const columns: DataTableColumn<ManagedUser>[] = [
    {
      id: 'user',
      header: 'User',
      cell: (user) => (
        <div className="flex min-w-[220px] items-center gap-3">
          <Avatar name={user.full_name} size="sm" />
          <div className="grid min-w-0 gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium text-foreground">{user.full_name}</span>
              {user.id === originalSuperAdminId && <Badge tone="info">Original Super Admin</Badge>}
            </span>
            <span className="truncate font-mono text-[11px] text-muted">{user.employee_id || user.id}</span>
          </div>
        </div>
      ),
    },
    {
      id: 'department',
      header: 'Department',
      cell: (user) => <span className="text-sm text-muted">{getDepartmentLabel(user.department)}</span>,
    },
    {
      id: 'role',
      header: 'Role',
      cell: (user) => (
        <Select
          value={user.role}
          disabled={user.id === currentUserId || user.role === 'Super Administrator' || !canManageUserRoles}
          onChange={(event) => onUpdate(user, 'role', event.target.value)}
          containerClassName="min-w-[170px]"
          aria-label={`Role for ${user.full_name}`}
        >
          {user.role === 'Super Administrator' && <option value="Super Administrator">Super Administrator</option>}
          {!roleOptions.some((role) => role.value === user.role) && user.role !== 'Super Administrator' && (
            <option value={user.role}>{roleLabels[user.role] || user.role} · unavailable for new assignments</option>
          )}
          {roleOptions.map((role) => <option value={role.value} key={role.id}>{role.label}</option>)}
        </Select>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (user) => (
        <Select
          value={user.account_status}
          disabled={user.id === currentUserId || user.role === 'Super Administrator' || !canEditUsers}
          onChange={(event) => onUpdate(user, 'account_status', event.target.value)}
          containerClassName="min-w-[150px]"
          aria-label={`Status for ${user.full_name}`}
        >
          {!['active', 'inactive'].includes(user.account_status) && (
            <option value={user.account_status} disabled>{user.account_status.charAt(0).toUpperCase() + user.account_status.slice(1)}</option>
          )}
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: (user) => (
        <div className="grid min-w-[170px] gap-2">
          <Select
            defaultValue=""
            disabled={user.id === currentUserId || user.role === 'Super Administrator' || (!canSuspendUsers && !canDeactivateUsers)}
            aria-label={`Actions for ${user.full_name}`}
            onChange={(event) => {
              const action = event.target.value
              if (action === 'Suspend' && canSuspendUsers) onUpdate(user, 'account_status', 'suspended')
              if (action === 'Deactivate' && canDeactivateUsers) onUpdate(user, 'account_status', 'inactive')
              event.currentTarget.value = ''
            }}
          >
            <option value="">Select action</option>
            {actionOptions.map((action) => <option value={action} key={action}>{action}</option>)}
          </Select>
          {canAppointSuperAdmins && user.role !== 'Super Administrator' && user.account_status === 'active' && (
            <Button
              size="sm"
              variant="outline"
              disabled={superAdminCount >= 3}
              onClick={() => onAppointSuperAdmin(user)}
            >
              Appoint as Super Admin
            </Button>
          )}
          {canRemoveSuperAdmins && user.role === 'Super Administrator' && user.id !== currentUserId && (
            <Button size="sm" variant="outline" onClick={() => onRemoveSuperAdmin(user)}>
              Remove Super Admin
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={users}
      rowKey={(user) => user.id}
      loading={loading}
      loadingRows={6}
      empty={
        <div className="grid justify-items-center gap-1 py-4">
          <strong className="text-sm font-semibold text-foreground">No users match the current filters</strong>
          <span className="text-sm text-muted">Adjust the filters or invite a new user.</span>
        </div>
      }
    />
  )
}
