import { useEffect, useState } from 'react'

import { Button, Checkbox, Dialog, Field, FormMessage, Input } from '../../../components/ui'
import type { Permission } from '../../../app/navigation'
import { BASELINE_PERMISSION_KEYS } from '../../../data/userManagementConfig'
import { supabase } from '../../../lib/supabase'
import { permissionCatalog, type CustomRoleRecord } from '../users/userHelpers'
import { groupedPermissions } from './types'

export function RoleEditorDialog({ open, onClose, organizationId, role, onSaved }: {
  open: boolean
  onClose: () => void
  organizationId: string
  role?: CustomRoleRecord | null
  onSaved?: (roleName: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setName(role?.name ?? '')
    setDescription(role?.description ?? '')
    setPermissions(Array.from(new Set([...BASELINE_PERMISSION_KEYS, ...(role?.permissions ?? [])])) as Permission[])
    setError('')
  }, [open, role])

  const togglePermission = (permission: Permission) => {
    if (BASELINE_PERMISSION_KEYS.includes(permission as typeof BASELINE_PERMISSION_KEYS[number])) return
    setPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission])
  }

  const setAllPermissions = (enabled: boolean) => {
    setPermissions(enabled ? [...permissionCatalog] : [...BASELINE_PERMISSION_KEYS] as Permission[])
  }

  const save = async () => {
    setError('')
    if (!name.trim()) {
      setError('Role name is required.')
      return
    }
    if (!permissions.length) {
      setError('Choose at least one permission before saving.')
      return
    }
    setSaving(true)
    try {
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
          p_is_active: true,
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
      title={role ? 'Edit custom role' : 'Create custom role'}
      description="Choose the permissions this role grants. Required baseline permissions are always included."
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void save()}>{role ? 'Save role' : 'Create role'}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role name" htmlFor="role-editor-name" required>
            <Input id="role-editor-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Permit Coordinator" />
          </Field>
          <Field label="Description" htmlFor="role-editor-description">
            <Input id="role-editor-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional description" />
          </Field>
        </div>

        <div className="grid gap-3">
          {groupedPermissions(permissionCatalog).map((section) => (
            <section key={section.group} className="grid gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{section.group}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {section.permissions.map((permission) => {
                  const required = BASELINE_PERMISSION_KEYS.includes(permission.key as typeof BASELINE_PERMISSION_KEYS[number])
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
