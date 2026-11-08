import { useEffect, useState } from 'react'

import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, Skeleton, buttonVariants } from '../../../components/ui'
import {
  ORGANIZATION_MANAGEABLE_BUILTIN_ROLE_KEYS,
  SUPER_ADMINISTRATOR_PERMISSION_KEYS,
  USER_MANAGEMENT_PERMISSION_CATALOG,
  USER_MANAGEMENT_ROLE_DEFINITIONS,
} from '../../../data/userManagementConfig'
import { supabase } from '../../../lib/supabase'
import type { CustomRoleRecord } from '../users/userHelpers'
import { RoleEditorDialog } from './RoleEditorDialog'
import { groupedPermissions, roleDescriptions, type RoleSummary } from './types'

type BuiltinRoleSetting = { role_key: string; display_name: string; is_active: boolean; is_deleted: boolean; permissions: string[] }
type RoleDeleteCandidate = { name: string; builtinRole?: BuiltinRoleSetting; customRole?: CustomRoleRecord }

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-line sm:border-l sm:pl-5 sm:first:border-l-0 sm:first:pl-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
      <span className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</span>
    </div>
  )
}

export function RolesPermissionsWorkspace({ organizationId, canManage }: { organizationId: string; canManage: boolean }) {
  const [customRoles, setCustomRoles] = useState<CustomRoleRecord[]>([])
  const [archivedCustomRoles, setArchivedCustomRoles] = useState<CustomRoleRecord[]>([])
  const [builtinRoles, setBuiltinRoles] = useState<BuiltinRoleSetting[]>([])
  const [selectedRoleName, setSelectedRoleName] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<CustomRoleRecord | null>(null)
  const [editingBuiltinRole, setEditingBuiltinRole] = useState<BuiltinRoleSetting | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<RoleDeleteCandidate | null>(null)
  const [restoreCandidate, setRestoreCandidate] = useState<CustomRoleRecord | null>(null)
  const [blockedDeletion, setBlockedDeletion] = useState<{ name: string; assignedCount: number } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadRoles = async () => {
    setLoading(true)
    setError('')
    const [builtinResult, customResult] = await Promise.all([
      supabase.rpc('list_organization_builtin_roles', { p_organization_id: organizationId }),
      supabase.from('custom_roles').select('*').eq('organization_id', organizationId).order('name'),
    ])
    if (builtinResult.error || customResult.error) {
      setCustomRoles([])
      setArchivedCustomRoles([])
      setBuiltinRoles([])
      setError('Unable to load roles and permissions. Please try again.')
      setLoading(false)
      return
    }
    const builtinRoleRows = (builtinResult.data ?? []) as BuiltinRoleSetting[]
    setBuiltinRoles(builtinRoleRows.map((role) => ({
      role_key: String(role.role_key),
      display_name: String(role.display_name),
      is_active: role.is_active !== false,
      is_deleted: role.is_deleted === true,
      permissions: Array.isArray(role.permissions) ? role.permissions as string[] : [],
    })))
    const mappedRoles = (customResult.data ?? []).map((role) => ({
      ...role,
      name: String(role.name ?? ''),
      permissions: Array.isArray(role.permissions) ? role.permissions as string[] : [],
      description: typeof role.description === 'string' ? role.description : null,
      is_active: role.is_active !== false,
      is_deleted: role.is_deleted === true,
    })) as CustomRoleRecord[]
    setCustomRoles(mappedRoles.filter((role) => role.is_deleted !== true))
    setArchivedCustomRoles(mappedRoles.filter((role) => role.is_deleted === true))
    setLoading(false)
  }

  useEffect(() => {
    void loadRoles()
  }, [organizationId])

  const summaries: (RoleSummary & { builtinSetting?: BuiltinRoleSetting })[] = [
    ...builtinRoles.filter((setting) => !setting.is_deleted).map((setting) => {
      const role = USER_MANAGEMENT_ROLE_DEFINITIONS.find((item) => item.backendName === setting.role_key)
      const roleName = role?.name ?? setting.role_key
      return {
      name: setting.display_name,
      description: roleDescriptions[roleName] || 'Organization-configured built-in role.',
      permissions: setting.permissions,
      isSystem: true,
      builtinSetting: setting,
    }}),
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

  const activeRole = summaries.find((role) => role.name === selectedRoleName) ?? summaries[0] ?? null
  const systemCount = summaries.filter((role) => role.isSystem).length
  const customCount = summaries.length - systemCount

  const openCreate = () => {
    setError('')
    setEditingRole(null)
    setEditingBuiltinRole(null)
    setDialogOpen(true)
  }

  const openEdit = (role: RoleSummary) => {
    if (!role.customRole) return
    setError('')
    setEditingRole(role.customRole)
    setEditingBuiltinRole(null)
    setDialogOpen(true)
  }

  const openBuiltinEdit = (role: RoleSummary & { builtinSetting?: BuiltinRoleSetting }) => {
    if (!role.builtinSetting || role.name === 'Super Administrator') return
    setError('')
    setEditingRole(null)
    setEditingBuiltinRole(role.builtinSetting)
    setDialogOpen(true)
  }

  const restoreCustomRole = async (target: CustomRoleRecord) => {
    setActionLoading(true)
    setError('')
    const result = await supabase.rpc('restore_custom_role', { p_role_id: target.id })
    if (result.error) {
      setError('Unable to restore the custom role. Please try again.')
    } else {
      setSuccess(`${target.name} was restored.`)
      setSelectedRoleName(target.name)
      setRestoreCandidate(null)
      await loadRoles()
    }
    setActionLoading(false)
  }

  const deleteRole = async () => {
    if (!deleteCandidate) return
    if (!deleteCandidate.builtinRole && !deleteCandidate.customRole?.id) {
      setError('Unable to identify the custom role to delete.')
      return
    }
    setActionLoading(true)
    setError('')
    setSuccess('')
    const result = deleteCandidate.builtinRole
      ? await supabase.rpc('delete_organization_builtin_role', {
          p_organization_id: organizationId,
          p_role_key: deleteCandidate.builtinRole.role_key,
        })
      : await supabase.rpc('delete_custom_role', { p_role_id: deleteCandidate.customRole?.id })
    if (result.error) {
      setError(result.error.message || 'Unable to delete the role.')
      setActionLoading(false)
      return
    }
    const outcome = result.data as { deleted?: boolean; assigned_user_count?: number } | null
    if (!outcome?.deleted) {
      setBlockedDeletion({
        name: deleteCandidate.name,
        assignedCount: Number(outcome?.assigned_user_count ?? 0),
      })
      setDeleteCandidate(null)
      setActionLoading(false)
      return
    }
    setSuccess(`${deleteCandidate.name} was deleted.`)
    setSelectedRoleName(null)
    setDeleteCandidate(null)
    await loadRoles()
    setActionLoading(false)
  }

  if (loading) {
    return (
      <div className="grid gap-5">
        <PageHeader eyebrow="Administration / Roles & permissions" title="Roles & permissions" description="Review platform roles and the permissions assigned to each role." />
        <Skeleton className="h-20 rounded-card" />
        <div className="grid gap-5 xl:grid-cols-12">
          <Skeleton className="h-[360px] rounded-card xl:col-span-7" />
          <Skeleton className="h-[360px] rounded-card xl:col-span-5" />
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Administration / Roles & permissions"
        title="Roles & permissions"
        description="Review platform roles and the permissions assigned to each role."
        actions={
          <>
            <a href="#administration" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Back to administration</a>
            {canManage && <Button size="sm" onClick={openCreate}>Create role</Button>}
          </>
        }
      />

      {error && (
        <Alert tone="danger">
          {error}
          <Button variant="outline" size="sm" className="mt-2" onClick={() => void loadRoles()}>Try again</Button>
        </Alert>
      )}
      {blockedDeletion && (
        <Alert tone="danger">
          This role cannot be deleted because {blockedDeletion.assignedCount} {blockedDeletion.assignedCount === 1 ? 'user is' : 'users are'} currently assigned to it.
          Reassign these users to another valid role before attempting deletion.
          <a href="#users" className="ml-1 font-semibold underline">Go to user management</a>.
        </Alert>
      )}
      {success && <Alert tone="success">{success}</Alert>}

      <section className="border-y border-line">
        <div className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-4">
          <SummaryStat label="Roles" value={String(summaries.length)} />
          <SummaryStat label="System roles" value={String(systemCount)} />
          <SummaryStat label="Custom roles" value={String(customCount)} />
          <SummaryStat label="Permissions" value={String(USER_MANAGEMENT_PERMISSION_CATALOG.length)} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="h-full p-5 shadow-none xl:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-0.5">
              <h2 className="font-display text-base font-semibold text-foreground">Role register</h2>
              <p className="text-sm text-muted">System roles are protected defaults; custom roles belong to this organization.</p>
            </div>
            <Badge tone="neutral">{summaries.length} roles</Badge>
          </div>

          <div className="mt-4 grid gap-2">
            {summaries.map((role) => {
              const selected = activeRole?.name === role.name
              return (
                <div
                  key={`${role.isSystem ? 'system' : 'custom'}-${role.name}`}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${selected ? 'border-brand/40 bg-brand/5' : 'border-line'}`}
                >
                  <div className="grid min-w-0 gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm font-medium text-foreground">{role.name}</strong>
                      <Badge tone={role.isSystem ? 'info' : 'accent'}>{role.isSystem ? 'System' : 'Custom'}</Badge>
                      {role.builtinSetting?.is_deleted && <Badge tone="danger">Deleted</Badge>}
                      {role.builtinSetting?.is_active === false && !role.builtinSetting.is_deleted && <Badge tone="warning">Disabled</Badge>}
                      {role.customRole?.is_active === false && <Badge tone="warning">Disabled</Badge>}
                    </div>
                    <span className="truncate text-xs text-muted">{role.description}</span>
                    <span className="font-mono text-[11px] text-muted">{role.permissions.length} permissions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedRoleName(role.name)}>View</Button>
                    {role.builtinSetting && canManage && !role.builtinSetting.is_deleted
                      && ORGANIZATION_MANAGEABLE_BUILTIN_ROLE_KEYS.some((roleKey) => roleKey === role.builtinSetting?.role_key) && (
                      <Button variant="ghost" size="sm" onClick={() => openBuiltinEdit(role)}>Manage</Button>
                    )}
                    {!role.isSystem && canManage && (
                      <Button variant="ghost" size="sm" onClick={() => openEdit(role)}>Edit</Button>
                    )}
                    {role.builtinSetting && canManage && !role.builtinSetting.is_deleted
                      && ORGANIZATION_MANAGEABLE_BUILTIN_ROLE_KEYS.some((roleKey) => roleKey === role.builtinSetting?.role_key) && (
                      <Button variant="ghost" size="sm" onClick={() => setDeleteCandidate({ name: role.name, builtinRole: role.builtinSetting })}>Delete</Button>
                    )}
                    {role.customRole && canManage && (
                      <Button variant="ghost" size="sm" onClick={() => setDeleteCandidate({ name: role.name, customRole: role.customRole })}>Delete</Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <Card className="h-full p-5 shadow-none xl:col-span-5">
          {activeRole ? (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-semibold text-foreground">{activeRole.name}</h2>
                    <Badge tone={activeRole.isSystem ? 'info' : 'accent'}>{activeRole.isSystem ? 'System' : 'Custom'}</Badge>
                  </div>
                  <p className="text-sm text-muted">{activeRole.description}</p>
                </div>
                {!activeRole.isSystem && canManage && (
                  <Button variant="outline" size="sm" onClick={() => openEdit(activeRole)}>Edit</Button>
                )}
              </div>

              {activeRole.isSystem && !('builtinSetting' in activeRole && activeRole.builtinSetting) && (
                <p className="rounded-xl border border-line bg-surface-soft px-3 py-2 text-xs text-muted">
                  Super Administrator is protected and cannot be changed through organization role settings.
                </p>
              )}

              <div className="rounded-xl border border-line bg-surface-soft px-3 py-2 text-xs text-muted">
                <span className="font-semibold uppercase tracking-wide">Scope</span>
                <p className="mt-1">
                  {activeRole.customRole
                    ? Object.keys(activeRole.customRole.scope ?? {}).length
                      ? JSON.stringify(activeRole.customRole.scope)
                      : 'Organization-wide access'
                    : 'Protected platform role'}
                </p>
              </div>

              <div className="grid gap-3">
                {groupedPermissions(activeRole.permissions).map((section) => (
                  <section key={section.group} className="grid gap-1.5">
                    <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{section.group}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {section.permissions.map((permission) => (
                        <Badge key={permission.key} tone="neutral">{permission.label}</Badge>
                      ))}
                    </div>
                  </section>
                ))}
                {!groupedPermissions(activeRole.permissions).length && <p className="text-sm text-muted">No permissions assigned.</p>}
              </div>
            </div>
          ) : (
            <EmptyState icon="administration" title="No role selected" description="Select a role from the register to review its permissions." />
          )}
        </Card>
      </div>

      <RoleEditorDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        organizationId={organizationId}
        role={editingRole}
        builtinRole={editingBuiltinRole}
        onSaved={(roleName) => {
          setSelectedRoleName(roleName)
          void loadRoles()
        }}
      />

      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div>
            <h2 className="font-display text-base font-semibold text-foreground">Deleted custom roles</h2>
            <p className="text-sm text-muted">Deleted roles are excluded from assignments and may be restored with their original permissions.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowArchive((current) => !current)}>
            {showArchive ? 'Hide archive' : `View archive (${archivedCustomRoles.length})`}
          </Button>
        </div>
        {showArchive && (archivedCustomRoles.length
          ? <div className="grid gap-2">
              {archivedCustomRoles.map((archivedRole) => (
                <div key={archivedRole.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                  <div className="min-w-0">
                    <strong className="text-sm font-medium text-foreground">{archivedRole.name}</strong>
                    <p className="text-xs text-muted">{archivedRole.description || 'Custom organization role'} · {archivedRole.permissions.length} permissions</p>
                  </div>
                  {canManage && <Button variant="outline" size="sm" onClick={() => setRestoreCandidate(archivedRole)}>Restore</Button>}
                </div>
              ))}
            </div>
          : <EmptyState icon="administration" title="No deleted custom roles" description="Deleted custom roles will appear here." />)}
      </section>

      <ConfirmDialog
        open={Boolean(deleteCandidate)}
        onClose={() => setDeleteCandidate(null)}
        onConfirm={() => void deleteRole()}
        title={`Delete ${deleteCandidate?.name ?? 'role'}?`}
        description="The role will be archived and unavailable for new assignments. Deletion is blocked while any users remain assigned; reassign them first."
        confirmLabel="Delete role"
        loading={actionLoading}
      />
      <ConfirmDialog
        open={Boolean(restoreCandidate)}
        onClose={() => setRestoreCandidate(null)}
        onConfirm={() => restoreCandidate && void restoreCustomRole(restoreCandidate)}
        title={`Restore ${restoreCandidate?.name ?? 'custom role'}?`}
        description="The original custom role and its permissions will be restored for future assignments."
        confirmLabel="Restore role"
        tone="default"
        loading={actionLoading}
      />
    </div>
  )
}
