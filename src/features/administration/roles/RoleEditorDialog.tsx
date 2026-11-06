import { useEffect, useState } from 'react'

import { Button, Checkbox, Dialog, Field, FormMessage, Input } from '../../../components/ui'
import type { Permission } from '../../../app/navigation'
import { BASELINE_PERMISSION_KEYS } from '../../../data/userManagementConfig'
import { supabase } from '../../../lib/supabase'
import { permissionCatalog, type CustomRoleRecord } from '../users/userHelpers'
import { groupedPermissions } from './types'

export function RoleEditorDialog({ open, onClose, organizationId, role, builtinRole, onSaved }: {
  open: boolean
  onClose: () => void
  organizationId: string
  role?: CustomRoleRecord | null
  builtinRole?: { role_key: string; display_name: string; is_active: boolean; permissions: string[] } | null
  onSaved?: (roleName: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isActive, setIsActive] = useState(true)

  useEffect(() => {
    if (!open) return
    setName(builtinRole?.display_name ?? role?.name ?? '')
    setDescription(role?.description ?? '')
    setPermissions(builtinRole
      ? Array.from(new Set(builtinRole.permissions)) as Permission[]
      : Array.from(new Set([...BASELINE_PERMISSION_KEYS, ...(role?.permissions ?? [])])) as Permission[])
    setIsActive(builtinRole?.is_active ?? true)
    if (!builtinRole && role) setIsActive(role.is_active !== false)
    setError('')
  }, [open, role, builtinRole])

  const togglePermission = (permission: Permission) => {
    if (!builtinRole && BASELINE_PERMISSION_KEYS.includes(permission as typeof BASELINE_PERMISSION_KEYS[number])) return
    setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission])
  }

  const setAllPermissions = (enabled: boolean) => {
    setPermissions(enabled ? [...permissionCatalog] : builtinRole ? [] : [...BASELINE_PERMISSION_KEYS] as Permission[])
  }

  const save = async () => {
    setError('')
    if (!builtinRole && !name.trim()) {
      setError('Role name is required.')
      return
    }
    if (!builtinRole && !permissions.length) {
      setError('Choose at least one permission before saving.')
      return
    }
    setSaving(true)
    try {
      if (builtinRole) {
        const { error: updateError } = await supabase.rpc('update_organization_builtin_role', {
          p_organization_id: organizationId,
          p_role_key: builtinRole.role_key,
          p_display_name: name.trim(),
          p_is_active: isActive,
          p_permissions: permissions,
        })
        if (updateError) throw updateError
        onSaved?.(name.trim())
        onClose()
        return
      }

      const payload = {
        p_name: name.trim(),
        p_description: description.trim() || null,
        p_permissions: Array.from(new Set([...BASELINE_PERMISSION_KEYS, ...permissions])),
        p_scope: { organizationId },
      }
      if (role?.id) {
        const { error: updateError } = await supabase.rpc('update_custom_role', {
          p_role_id: role.id,
          ...payload,
          p_is_active: isActive,
        })
        if (updateError) throw updateError
      } else {
        const { error: createError } = await supabase.rpc('create_custom_role', {
          p_organization_id: organizationId,
          ...payload,
        })
        if (createError) throw createError
      }
      onSaved?.(name.trim())
      onClose()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the custom role.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={builtinRole ? 'Manage built-in role' : role ? 'Edit custom role' : 'Create custom role'}
      description={builtinRole
        ? "Set this organization's display name, availability for future assignments, and permissions."
        : 'Choose the permissions this role grants. Required baseline permissions are always included.'}
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void save()}>{builtinRole ? 'Save role' : role ? 'Save role' : 'Create role'}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={builtinRole ? 'Organization display name' : 'Role name'} htmlFor="role-editor-name" required>
            <Input id="role-editor-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Permit Coordinator" />
          </Field>
          {!builtinRole && (
            <Field label="Description" htmlFor="role-editor-description">
              <Input id="role-editor-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional description" />
            </Field>
          )}
        </div>

        {builtinRole && (
          <Checkbox
            checked={isActive}
            onChange={setIsActive}
            disabled={saving}
            label="Available for new assignments (existing users keep their current role and permissions)"
          />
        )}
        {!builtinRole && role && (
          <Checkbox
            checked={isActive}
            onChange={setIsActive}
            disabled={saving}
            label="Available for new assignments (existing users keep their current role and permissions)"
          />
        )}

        <div className="grid gap-3">
          {groupedPermissions(permissionCatalog).map((section) => (
            <section key={section.group} className="grid gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{section.group}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {section.permissions.map((permission) => {
                  const required = !builtinRole && BASELINE_PERMISSION_KEYS.includes(permission.key as typeof BASELINE_PERMISSION_KEYS[number])
                  return (
                    <Checkbox
                      key={permission.key}
                      checked={permissions.includes(permission.key as Permission)}
                      disabled={required || saving}
                      onChange={() => togglePermission(permission.key as Permission)}
                      className="items-start rounded-xl border border-line px-3 py-2"
                      label={
                        <span className="grid gap-0.5">
                          <strong className="text-sm font-medium text-foreground">{permission.label}{required ? ' · Required' : ''}</strong>
                          <span className="text-xs text-muted">{permission.description}</span>
                        </span>
                      }
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <Checkbox
          checked={permissions.length === permissionCatalog.length}
          onChange={setAllPermissions}
          label="Select all permissions"
          disabled={saving}
        />
        <FormMessage error={error} />
      </div>
    </Dialog>
  )
}
