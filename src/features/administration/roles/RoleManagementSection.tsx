import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import type { Permission } from '../../../app/navigation'
import { FormMessage } from '../../../components/ui/form-message'
import { BASELINE_PERMISSION_KEYS, BUILT_IN_BACKEND_ROLES, permissionsForRole } from '../../../data/userManagementConfig'
import { supabase } from '../../../lib/supabase'
import { permissionCatalog, type CustomRoleRecord } from '../users/userHelpers'
import { groupedPermissions } from './types'

export function RoleManagementSection({ organizationId, focusRoleName, canManage = true }: { organizationId: string; focusRoleName?: string; canManage?: boolean }) {
  const [customRoles, setCustomRoles] = useState<CustomRoleRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const [roleForm, setRoleForm] = useState({ name: '', description: '', permissions: [...BASELINE_PERMISSION_KEYS] as Permission[] })
  const [saving, setSaving] = useState(false)
  const allEditablePermissions = permissionCatalog

  const loadCustomRoles = async () => {
    setLoading(true)
    setError('')

    const { data, error: roleError } = await supabase
      .from('custom_roles')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true })

    if (roleError) {
      setError('Unable to load roles and permissions. Please try again.')
      setCustomRoles([])
      setLoading(false)
      return
    }

    const normalizedRoles = (data ?? []).map((role) => ({
      ...role,
      name: String(role.name ?? ''),
      permissions: Array.isArray(role.permissions) ? (role.permissions as string[]) : [],
      description: typeof role.description === 'string' ? role.description : null,
      scope: role.scope && typeof role.scope === 'object' ? (role.scope as Record<string, unknown>) : {},
      is_system: Boolean(role.is_system),
      is_active: role.is_active !== false,
    })) as CustomRoleRecord[]

    setCustomRoles(normalizedRoles)
    setLoading(false)
  }

  useEffect(() => {
    void loadCustomRoles()
  }, [organizationId])

  const resetForm = () => {
    setSelectedRoleId(null)
    setRoleForm({ name: '', description: '', permissions: [...BASELINE_PERMISSION_KEYS] as Permission[] })
  }

  const togglePermission = (permission: Permission) => {
    if (BASELINE_PERMISSION_KEYS.includes(permission as typeof BASELINE_PERMISSION_KEYS[number])) return
    setRoleForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }))
  }

  const setAllPermissions = (enabled: boolean) => {
    setRoleForm((current) => ({
      ...current,
      permissions: enabled ? [...allEditablePermissions] : [...BASELINE_PERMISSION_KEYS] as Permission[],
    }))
  }

  const handleEditRole = (role: CustomRoleRecord) => {
    setSelectedRoleId(role.id ?? null)
    setRoleForm({
      name: role.name,
      description: role.description ?? '',
      permissions: Array.from(new Set([...BASELINE_PERMISSION_KEYS, ...(Array.isArray(role.permissions) ? role.permissions : [])])) as Permission[],
    })
  }

  useEffect(() => {
    if (!focusRoleName) return
    const role = customRoles.find((item) => item.name === focusRoleName)
    if (role) handleEditRole(role)
  }, [customRoles, focusRoleName])

  // One form handles both creating and updating a custom role, then reloads the list after the database write succeeds.
  // Required baseline permissions are included each time so every saved role retains the app's minimum access set.
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    setError('')
    setSaving(true)

    try {
      if (!roleForm.name.trim()) {
        setError('Role name is required.')
        return
      }

      if (!roleForm.permissions.length) {
        setError('Choose at least one permission before saving.')
        return
      }

      const payload = {
        p_name: roleForm.name.trim(),
        p_description: roleForm.description.trim() || null,
        p_permissions: Array.from(new Set([...BASELINE_PERMISSION_KEYS, ...roleForm.permissions])),
        p_scope: { organizationId },
      }

      if (selectedRoleId) {
        const { error: updateError } = await supabase.rpc('update_custom_role', {
          p_role_id: selectedRoleId,
          p_name: payload.p_name,
          p_description: payload.p_description,
          p_permissions: payload.p_permissions,
          p_scope: payload.p_scope,
          p_is_active: true,
        })

        if (updateError) throw updateError
        setMessage('Custom role updated successfully.')
      } else {
        const { error: createError } = await supabase.rpc('create_custom_role', {
          p_organization_id: organizationId,
          p_name: payload.p_name,
          p_description: payload.p_description,
          p_permissions: payload.p_permissions,
          p_scope: payload.p_scope,
        })

        if (createError) throw createError
        setMessage('Custom role created successfully.')
      }

      resetForm()
      await loadCustomRoles()
    } catch (saveError) {
      const operation = selectedRoleId ? 'update' : 'create'
      const detail = saveError instanceof Error ? ` ${saveError.message}` : ''
      setError(`Unable to ${operation} the custom role.${detail}`)
    } finally {
      setSaving(false)
    }
  }

  const builtInRoleCards = BUILT_IN_BACKEND_ROLES.map((role) => {
    const configuredPermissions = permissionsForRole(role)
    return {
      name: role,
      description: 'System-defined role protected by the platform configuration.',
      permissions: configuredPermissions,
      is_system: true,
      is_active: true,
      scope: { restricted: true },
    }
  })

  return (
    <div className="workspace-panel role-management-panel">
      <div className="workspace-panel-heading">
        <div>
          <div className="eyebrow">ROLE MANAGEMENT</div>
          <h2>Custom Roles & Permissions</h2>
          <p>Review system roles, create organization-specific roles, and maintain permission scopes.</p>
        </div>
      </div>

      <p className="workspace-note">Built-in platform roles are protected defaults. Custom organization roles are persisted through the existing secure role backend.</p>

      {canManage && <form className="role-manager-form" onSubmit={handleSubmit}>
        <div className="role-form-grid">
          <label>
            Role name
            <input value={roleForm.name} onChange={(event) => setRoleForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Permit Coordinator" required />
          </label>
          <label>
            Description
            <input value={roleForm.description} onChange={(event) => setRoleForm((current) => ({ ...current, description: event.target.value }))} placeholder="Optional description" />
          </label>
        </div>

        <div className="permission-group-list">
          {groupedPermissions(permissionCatalog).map((section) => <section className="permission-group" key={section.group}><strong>{section.group}</strong><div className="permission-grid">{section.permissions.map((permission) => { const required = BASELINE_PERMISSION_KEYS.includes(permission.key as typeof BASELINE_PERMISSION_KEYS[number]); return <label className={`permission-toggle${required ? ' permission-required' : ''}`} key={permission.key}><input type="checkbox" checked={roleForm.permissions.includes(permission.key as Permission)} disabled={required} onChange={() => togglePermission(permission.key as Permission)} /><span><b>{permission.label}{required ? ' · Required' : ''}</b><small>{permission.description}</small></span></label> })}</div></section>)}
        </div>

        <label className="permission-toggle permission-select-all">
          <input type="checkbox" checked={roleForm.permissions.length === allEditablePermissions.length} onChange={(event) => setAllPermissions(event.target.checked)} />
          <span>Select all permissions</span>
        </label>

        <div className="role-form-actions">
          <button className="button button-green button-small" type="submit" disabled={saving}>{saving ? (selectedRoleId ? 'Saving...' : 'Creating...') : (selectedRoleId ? 'Save role' : 'Create role')}</button>
          {selectedRoleId && <button className="button button-outline workspace-refresh" type="button" onClick={resetForm}>Cancel edit</button>}
        </div>
      </form>}

      <FormMessage error={error} success={message} />

      {loading ? (
        <div className="workspace-empty">Loading roles...</div>
      ) : (
        <div className="role-card-list">
          {[...builtInRoleCards, ...customRoles.map((role) => ({
            name: role.name,
            description: role.description ?? 'Custom organization role.',
            permissions: role.permissions as Permission[],
            is_system: false,
            is_active: role.is_active !== false,
            scope: role.scope ?? {},
            id: role.id,
          }))].map((role) => (
            <div className="role-card" key={`${role.is_system ? 'system' : 'custom'}-${role.name}`}>
              <div className="role-card-header">
                <div>
                  <strong>{role.name}</strong>
                  <small>{role.is_system ? 'System role' : 'Custom role'}</small>
                </div>
                {!role.is_system && (
                  <button className="button button-outline button-small" type="button" onClick={() => { const selectedRole = customRoles.find((item) => item.name === role.name); if (selectedRole) handleEditRole(selectedRole) }}>Edit</button>
                )}
              </div>
              <p>{role.description}</p>
              <div className="role-permission-list">
                {role.permissions.map((permission) => <span key={`${role.name}-${permission}`}>{permission.replaceAll('_', ' ')}</span>)}
              </div>
              <div className="role-scope">
                <span>Scope</span>
                <strong>{Object.keys(role.scope ?? {}).length ? JSON.stringify(role.scope) : 'Organization-wide access'}</strong>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// This workspace brings together organization user listings, invitations, role and status edits, and user-register exports.
