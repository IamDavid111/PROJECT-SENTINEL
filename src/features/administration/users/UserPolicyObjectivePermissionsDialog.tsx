import { useEffect, useState } from 'react'

import { Alert, Dialog, Select } from '../../../components/ui'
import { supabase } from '../../../lib/supabase'

const permissionOptions = [
  { key: 'view_policy_objectives_register', label: 'View Policy and Objectives Register' },
  { key: 'manage_policy_objectives', label: 'Manage Policy and Objectives' },
  { key: 'view_legal_compliance_register', label: 'View Legal and Compliance Register' },
  { key: 'manage_legal_compliance_obligations', label: 'Manage Legal and Compliance Obligations' },
] as const

type PermissionKey = typeof permissionOptions[number]['key']
type OverrideValues = Record<PermissionKey, boolean | null>

const emptyOverrides: OverrideValues = {
  view_policy_objectives_register: null,
  manage_policy_objectives: null,
  view_legal_compliance_register: null,
  manage_legal_compliance_obligations: null,
}

export function UserPolicyObjectivePermissionsDialog({ open, onClose, organizationId, user }: {
  open: boolean
  onClose: () => void
  organizationId: string
  user: { id: string; full_name: string } | null
}) {
  const [overrides, setOverrides] = useState<OverrideValues>(emptyOverrides)
  const [loading, setLoading] = useState(false)
  const [savingPermission, setSavingPermission] = useState<PermissionKey | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !user) return
    let active = true
    setLoading(true)
    setError('')
    void (async () => {
      try {
        const { data, error: responseError } = await supabase.rpc('get_policy_objective_user_permission_overrides', {
          p_organization_id: organizationId,
          p_target_user_id: user.id,
        })
        if (responseError) throw responseError
        if (!active) return
        const current = { ...emptyOverrides }
        for (const row of data ?? []) {
          if (row.permission_key in current) current[row.permission_key as PermissionKey] = row.is_granted
        }
        setOverrides(current)
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load individual permissions.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [open, organizationId, user])

  const updatePermission = async (permissionKey: PermissionKey, value: string) => {
    const isGranted = value === '' ? null : value === 'true'
    setSavingPermission(permissionKey)
    setError('')
    const { error: saveError } = await supabase.rpc('set_policy_objective_user_permission_override', {
      p_organization_id: organizationId,
      p_target_user_id: user?.id,
      p_permission_key: permissionKey,
      p_is_granted: isGranted,
    })
    setSavingPermission(null)
    if (saveError) {
      setError(saveError.message || 'Unable to update the permission.')
      return
    }
    setOverrides((current) => ({ ...current, [permissionKey]: isGranted }))
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Register permissions"
      description={user ? `Individual overrides for ${user.full_name}.` : undefined}
      className="sm:max-w-2xl"
    >
      <div className="grid gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        {loading ? <p className="text-sm text-muted">Loading permissions…</p> : permissionOptions.map((permission) => (
          <label key={permission.key} className="grid gap-2 rounded-card border border-line p-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
            <span className="text-sm font-medium text-foreground">{permission.label}</span>
            <Select
              value={overrides[permission.key] === null ? '' : String(overrides[permission.key])}
              onChange={(event) => void updatePermission(permission.key, event.target.value)}
              disabled={Boolean(savingPermission)}
              aria-label={`${permission.label} individual override`}
            >
              <option value="">Use role permission</option>
              <option value="true">Grant to this user</option>
              <option value="false">Revoke for this user</option>
            </Select>
          </label>
        ))}
      </div>
    </Dialog>
  )
}