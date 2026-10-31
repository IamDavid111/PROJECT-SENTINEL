import { useEffect, useState } from 'react'

import { Alert, Badge, Button, Card, EmptyState, PageHeader, Skeleton, buttonVariants } from '../../../components/ui'
import {
  SUPER_ADMINISTRATOR_PERMISSION_KEYS,
  USER_MANAGEMENT_PERMISSION_CATALOG,
  USER_MANAGEMENT_ROLE_DEFINITIONS,
  USER_MANAGEMENT_ROLE_PERMISSION_MATRIX,
  permissionsForRole,
} from '../../../data/userManagementConfig'
import { supabase } from '../../../lib/supabase'
import type { CustomRoleRecord } from '../users/userHelpers'
import { RoleEditorDialog } from './RoleEditorDialog'
import { groupedPermissions, roleDescriptions, type RoleSummary } from './types'

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
  const [selectedRoleName, setSelectedRoleName] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<CustomRoleRecord | null>(null)
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
    {
      name: 'Auditor',
      description: 'Read-only audit role protected by the platform configuration.',
      permissions: permissionsForRole('Auditor'),
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
    setDialogOpen(true)
  }

  const openEdit = (role: RoleSummary) => {
    if (!role.customRole) return
    setError('')
    setEditingRole(role.customRole)
    setDialogOpen(true)
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
                    </div>
                    <span className="truncate text-xs text-muted">{role.description}</span>
                    <span className="font-mono text-[11px] text-muted">{role.permissions.length} permissions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelectedRoleName(role.name)}>View</Button>
                    {!role.isSystem && canManage && (
                      <Button variant="ghost" size="sm" onClick={() => openEdit(role)}>Edit</Button>
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

              {activeRole.isSystem && (
                <p className="rounded-xl border border-line bg-surface-soft px-3 py-2 text-xs text-muted">
                  Protected platform default. Changes shown here are not presented as organization-persisted edits.
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
        onSaved={(roleName) => {
          setSelectedRoleName(roleName)
          void loadRoles()
        }}
      />
    </div>
  )
}
