import { Avatar, DataTable, Select, type DataTableColumn } from '../../../components/ui'
import { USER_ACTION_OPTIONS } from '../../../data/userManagementConfig'
import { getDepartmentLabel } from './userHelpers'
import type { ManagedUser } from './types'

export function UsersTable({ users, loading, roleOptions, currentUserId, canManageUserRoles, canEditUsers, canSuspendUsers, canDeactivateUsers, onUpdate }: {
  users: ManagedUser[]
  loading: boolean
  roleOptions: Array<{ id: string; label: string; value: string }>
  currentUserId: string
  canManageUserRoles: boolean
  canEditUsers: boolean
  canSuspendUsers: boolean
  canDeactivateUsers: boolean
  onUpdate: (user: ManagedUser, field: 'role' | 'account_status', value: string) => void
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
            <span className="truncate text-sm font-medium text-foreground">{user.full_name}</span>
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
          disabled={user.id === currentUserId || !canManageUserRoles}
          onChange={(event) => onUpdate(user, 'role', event.target.value)}
          containerClassName="min-w-[170px]"
          aria-label={`Role for ${user.full_name}`}
        >
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
          disabled={user.id === currentUserId || !canEditUsers}
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
        <Select
          defaultValue=""
          disabled={user.id === currentUserId || (!canSuspendUsers && !canDeactivateUsers)}
          aria-label={`Actions for ${user.full_name}`}
          containerClassName="min-w-[150px]"
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
