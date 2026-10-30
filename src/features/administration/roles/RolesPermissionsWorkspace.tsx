import { useEffect, useState } from 'react'

import { FormMessage } from '../../../components/ui/form-message'
import { SUPER_ADMINISTRATOR_PERMISSION_KEYS, USER_MANAGEMENT_ROLE_DEFINITIONS, USER_MANAGEMENT_ROLE_PERMISSION_MATRIX } from '../../../data/userManagementConfig'
import { supabase } from '../../../lib/supabase'
import type { CustomRoleRecord } from '../users/userHelpers'
import { RoleManagementSection } from './RoleManagementSection'
import { groupedPermissions, roleDescriptions, type RoleSummary } from './types'

export function RolesPermissionsWorkspace({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const [customRoles, setCustomRoles] = useState<CustomRoleRecord[]>([])
  const [selectedRole, setSelectedRole] = useState<RoleSummary | null>(null)
  const [editingRoleName, setEditingRoleName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadRoles = async () => {
    setLoading(true)
    setError('')
    const { data, error: roleError } = await supabase.from('custom_roles').select('*').eq('organization_id', organizationId).eq('is_active', true).order('name')
    if (roleError) {
      setCustomRoles([])
      setError('Unable to load roles and permissions. Please try again.')
      setLoading(false)
      return
    }
    setCustomRoles((data ?? []).map((role) => ({
      ...role,
      name: String(role.name ?? ''),
      permissions: Array.isArray(role.permissions) ? role.permissions as string[] : [],
      description: typeof role.description === 'string' ? role.description : null,
      is_active: role.is_active !== false,
    })) as CustomRoleRecord[])
    setLoading(false)
  }

  useEffect(() => {
    void loadRoles()
  }, [organizationId])

  const summaries: RoleSummary[] = [
    ...USER_MANAGEMENT_ROLE_DEFINITIONS.map((role) => ({
      name: role.name,
      description: roleDescriptions[role.name] || 'Platform role with centrally configured permissions.',
      permissions: USER_MANAGEMENT_ROLE_PERMISSION_MATRIX[role.name],
      isSystem: true,
    })),
    {
      name: 'Super Administrator',
      description: 'Unrestricted platform administrator with authority to make supported changes and additions.',
      permissions: SUPER_ADMINISTRATOR_PERMISSION_KEYS,
      isSystem: true,
    },
    ...customRoles.map((role) => ({
      name: role.name,
      description: role.description || 'Custom organization role.',
      permissions: role.permissions,
      isSystem: false,
      customRole: role,
    })),
  ]

  return (
    <div className="workspace-panel role-management-panel">
      <div className="workspace-panel-heading">
        <div>
          <div className="eyebrow">ADMINISTRATION / ROLES &amp; PERMISSIONS</div>
          <h2>Roles &amp; Permissions</h2>
          <p>Review platform roles and the permissions assigned to each role.</p>
        </div>
        <a className="button button-outline button-small" href="#administration">Back to Administration</a>
      </div>
      {error && <div className="role-state-message"><FormMessage error={error} /><button className="button button-outline button-small" type="button" onClick={() => void loadRoles()}>Try again</button></div>}
      {loading ? <div className="workspace-empty">Loading roles and permissions...</div> : summaries.length === 0 ? <div className="workspace-empty">No roles configured.</div> : (
        <div className="role-summary-table-wrap">
          <table className="role-summary-table">
            <thead><tr><th>Role</th><th>Description</th><th>Permissions</th><th>Actions</th></tr></thead>
            <tbody>{summaries.map((role) => <tr key={`${role.isSystem ? 'system' : 'custom'}-${role.name}`}>
              <td><strong>{role.name}</strong><small>{role.isSystem ? 'System role' : 'Custom role'}</small></td>
              <td>{role.description}</td>
              <td>{role.permissions.length}</td>
              <td className="role-summary-actions">
                <button className="button button-outline button-small" type="button" onClick={() => setSelectedRole(role)}>View</button>
                {!role.isSystem && canManage && <button className="button button-green button-small" type="button" onClick={() => { setSelectedRole(role); setEditingRoleName(role.name) }}>Edit</button>}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
      )}
      {selectedRole && <div className="role-detail-panel">
        <div className="eyebrow">ROLE DETAILS</div>
        <h3>{selectedRole.name}</h3>
        <p>{selectedRole.description}</p>
        {selectedRole.isSystem && <p className="workspace-note">Protected platform default. Changes shown here are not presented as organization-persisted edits.</p>}
        <div className="permission-group-list">{groupedPermissions(selectedRole.permissions).map((section) => <section className="permission-group" key={`${selectedRole.name}-${section.group}`}><strong>{section.group}</strong><div className="role-permission-list">{section.permissions.map((permission) => <span title={permission.description} key={`${selectedRole.name}-${permission.key}`}>{permission.label}</span>)}</div></section>)}</div>
      </div>}
      {editingRoleName && canManage && <RoleManagementSection organizationId={organizationId} focusRoleName={editingRoleName} canManage />}
    </div>
  )
}

