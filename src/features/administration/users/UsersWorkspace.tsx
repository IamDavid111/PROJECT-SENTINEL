import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { Alert, Button, Card, ExportMenu, PageHeader, SearchField, Select, Skeleton, buttonVariants } from '../../../components/ui'
import { starnetMockUserBatch } from '../../../data/starnetMockUserBatch'
import { USER_MANAGEMENT_BACKEND_TO_ROLE, USER_MANAGEMENT_ROLE_DEFINITIONS } from '../../../data/userManagementConfig'
import { getEdgeFunctionErrorMessage } from '../../../lib/edgeFunctionError'
import { recordActivity } from '../../../lib/activity'
import { supabase } from '../../../lib/supabase'
import { normalizeDepartmentSettings, type DepartmentOption } from '../../settings/companySettingsTypes'
import { RoleEditorDialog } from '../roles/RoleEditorDialog'
import { DepartmentDialog } from './DepartmentDialog'
import { InvitationsCard } from './InvitationsCard'
import { InviteUserCard } from './InviteUserCard'
import { MockDataCard } from './MockDataCard'
import { UsersTable } from './UsersTable'
import { exportCsv, exportExcel, exportPdf, exportWord } from './userExport'
import { getDepartmentLabel, matchesManagedUserFilters, type CustomRoleRecord } from './userHelpers'
import type { ExportAdmin, ExportFormat, ManagedUser, MockIncidentBatchResult, MockUserBatchResult, OrganizationInvitation } from './types'

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-line sm:border-l sm:pl-5 sm:first:border-l-0 sm:first:pl-0">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
      <span className="font-display text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</span>
    </div>
  )
}

export function UsersWorkspace({ organizationId, currentUserId, canInviteUsers, canEditUsers, canSuspendUsers, canDeactivateUsers, canManageUserRoles, canManageRolesPermissions }: { organizationId: string; currentUserId: string; canInviteUsers: boolean; canEditUsers: boolean; canSuspendUsers: boolean; canDeactivateUsers: boolean; canManageUserRoles: boolean; canManageRolesPermissions: boolean }) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteDepartment, setInviteDepartment] = useState('')
  const [inviteRole, setInviteRole] = useState('Field Worker')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const [invitationsLoading, setInvitationsLoading] = useState(false)
  const [resendingEmail, setResendingEmail] = useState<string | null>(null)
  const [showInvitations, setShowInvitations] = useState(false)
  const [mockBatchLoading, setMockBatchLoading] = useState(false)
  const [mockBatchResult, setMockBatchResult] = useState<MockUserBatchResult | null>(null)
  const [mockIncidentLoading, setMockIncidentLoading] = useState(false)
  const [mockIncidentResult, setMockIncidentResult] = useState<MockIncidentBatchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [customRoles, setCustomRoles] = useState<CustomRoleRecord[]>([])
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [departmentModalOpen, setDepartmentModalOpen] = useState(false)
  const [departmentDraft, setDepartmentDraft] = useState('')
  const [departmentLoading, setDepartmentLoading] = useState(false)
  const [exportAdmin, setExportAdmin] = useState<ExportAdmin | null>(null)
  const [exportLoading, setExportLoading] = useState(false)

  const loadDepartments = async () => {
    const { data, error: settingsError } = await supabase
      .from('company_settings')
      .select('departments')
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (settingsError) {
      setError(settingsError.message)
      return
    }
    setDepartments(normalizeDepartmentSettings(data?.departments).filter((department) => department.active))
  }

  const loadCustomRoles = async () => {
    const { data, error: customRoleError } = await supabase
      .from('custom_roles')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name', { ascending: true })
    if (customRoleError) {
      setError(customRoleError.message)
      setCustomRoles([])
      return
    }
    setCustomRoles((data ?? []).filter((role) => role.is_active !== false).map((role) => ({
      ...role,
      name: String(role.name ?? ''),
      permissions: Array.isArray(role.permissions) ? role.permissions as string[] : [],
      description: typeof role.description === 'string' ? role.description : null,
      scope: role.scope && typeof role.scope === 'object' ? role.scope as Record<string, unknown> : {},
      is_system: Boolean(role.is_system),
      is_active: role.is_active !== false,
    })))
  }

  const loadUsers = async () => {
    setLoading(true)
    setError('')
    const [{ data: profiles, error: profileError }, { data: memberships, error: membershipError }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, employee_id, department, job_title, account_status').eq('organization_id', organizationId).order('full_name'),
      supabase.from('memberships').select('user_id, role').eq('organization_id', organizationId),
    ])
    if (profileError || membershipError) setError(profileError?.message || membershipError?.message || 'Unable to load users.')
    else {
      const roleByUser = new Map((memberships || []).map((membership) => [membership.user_id, String(membership.role)]))
      setUsers((profiles || []).map((profile) => ({ ...profile, role: roleByUser.get(profile.id) || 'Field Worker' })))
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadCustomRoles()
    void loadDepartments()
    void loadUsers()
    void (async () => {
      const [{ data: profile, error: profileError }, { data: membership, error: membershipError }] = await Promise.all([
        supabase.from('profiles').select('full_name, department').eq('id', currentUserId).eq('organization_id', organizationId).maybeSingle(),
        supabase.from('memberships').select('role').eq('user_id', currentUserId).eq('organization_id', organizationId).maybeSingle(),
      ])
      if (profileError || membershipError || !profile?.full_name || !membership?.role) {
        setExportAdmin(null)
        setError('Unable to verify the authenticated administrator identity for export.')
        return
      }
      setExportAdmin({ fullName: profile.full_name, role: String(membership.role), department: profile.department })
    })()
  }, [currentUserId, organizationId])

  const roleComboOptions = [
    ...USER_MANAGEMENT_ROLE_DEFINITIONS.map((role) => ({ id: role.id, label: role.name, value: role.backendName })),
    ...customRoles.map((role) => ({ id: `custom-${role.id || role.name}`, label: role.name, value: role.name })),
  ]

  const inviteUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canInviteUsers) {
      setError('You are not authorized to invite users.')
      return
    }
    setError('')
    setMessage('')
    setInviteLoading(true)
    const { error: inviteError } = await supabase.functions.invoke('admin-invite-user', {
      body: { organizationId, email: inviteEmail, department: inviteDepartment || null, role: inviteRole },
    })
    setInviteLoading(false)
    if (inviteError) setError(await getEdgeFunctionErrorMessage(inviteError))
    else {
      await recordActivity(organizationId, currentUserId, 'Invitation sent', { has_department: Boolean(inviteDepartment), role: inviteRole })
      setMessage(`Invitation sent to ${inviteEmail}.`)
      setInviteEmail('')
      setInviteDepartment('')
      void loadUsers()
    }
  }

  const loadInvitations = async () => {
    setInvitationsLoading(true)
    const { data, error: invitationsError } = await supabase.rpc('list_organization_invitations')
    setInvitationsLoading(false)
    if (invitationsError) {
      setError(invitationsError.message)
      return
    }
    setInvitations((data as OrganizationInvitation[] | null) || [])
  }

  const resendInvitation = async (invitation: OrganizationInvitation) => {
    setError('')
    setMessage('')
    setResendingEmail(invitation.invitee_email)
    const { error: resendError } = await supabase.functions.invoke('admin-invite-user', {
      body: { organizationId, email: invitation.invitee_email, department: invitation.department, role: invitation.role },
    })
    setResendingEmail(null)
    if (resendError) {
      setError(await getEdgeFunctionErrorMessage(resendError))
      return
    }
    setMessage(`A new invitation was sent to ${invitation.invitee_email}.`)
    await loadInvitations()
  }

  const createMockUserBatch = async () => {
    if (!canInviteUsers || organizationId !== starnetMockUserBatch.organizationId) {
      setError('This mock-user batch is restricted to StarNet Tech administrators.')
      return
    }
    setError('')
    setMessage('')
    setMockBatchLoading(true)
    setMockBatchResult(null)
    const { data, error: batchError } = await supabase.functions.invoke('admin-seed-mock-users', {
      body: { ...starnetMockUserBatch, organizationId },
    })
    setMockBatchLoading(false)
    if (batchError) {
      setError(await getEdgeFunctionErrorMessage(batchError))
      return
    }
    const result = data as MockUserBatchResult
    setMockBatchResult(result)
    setMessage(`Mock batch complete: ${result.createdCount} created, ${result.alreadyExistingCount} already existed.`)
    await loadUsers()
  }

  const seedMockIncidentBatch = async () => {
    if (!canInviteUsers || organizationId !== starnetMockUserBatch.organizationId) {
      setError('This mock-incident batch is restricted to StarNet Tech administrators.')
      return
    }
    setError('')
    setMessage('')
    setMockIncidentLoading(true)
    setMockIncidentResult(null)
    const { data, error: seedError } = await supabase.functions.invoke('admin-seed-mock-incidents', {
      body: { organizationId, organizationCode: starnetMockUserBatch.organizationCode, batchId: 'MOCK-STARNET-INCIDENTS-20260929' },
    })
    setMockIncidentLoading(false)
    if (seedError) {
      setError(await getEdgeFunctionErrorMessage(seedError))
      return
    }
    const result = data as MockIncidentBatchResult
    setMockIncidentResult(result)
    setMessage(`Incident batch complete: ${result.createdCount} created, ${result.alreadyExistingCount} already present.`)
    window.dispatchEvent(new CustomEvent('incident-records-updated', { detail: { organizationId } }))
  }

  const saveDepartment = async () => {
    const name = departmentDraft.trim()
    if (!name) {
      setError('Department name is required.')
      return
    }
    if (departments.some((department) => department.name.toLowerCase() === name.toLowerCase())) {
      setError('That department already exists.')
      return
    }
    setDepartmentLoading(true)
    setError('')
    const { data: settings, error: settingsError } = await supabase
      .from('company_settings')
      .select('departments')
      .eq('organization_id', organizationId)
      .maybeSingle()
    if (settingsError) {
      setDepartmentLoading(false)
      setError(settingsError.message)
      return
    }
    const currentDepartments = normalizeDepartmentSettings(settings?.departments)
    const nextDepartments = [...currentDepartments.filter((department) => department.name.toLowerCase() !== name.toLowerCase()), { name, active: true }]
    const { error: saveError } = await supabase
      .from('company_settings')
      .upsert({ organization_id: organizationId, departments: nextDepartments })
    setDepartmentLoading(false)
    if (saveError) {
      setError(saveError.message)
      return
    }
    await loadDepartments()
    setInviteDepartment(name)
    setDepartmentDraft('')
    setDepartmentModalOpen(false)
    await recordActivity(organizationId, currentUserId, 'Department created', { department_name: name })
    setMessage(`Department "${name}" created and selected.`)
  }

  const updateUser = async (user: ManagedUser, field: 'role' | 'account_status', value: string) => {
    setError('')
    setMessage('')
    if (field === 'role') {
      if (!canManageUserRoles) return setError('You are not authorized to change user roles.')
      const { error: updateError } = await supabase.rpc('update_user_role', { p_organization_id: organizationId, p_target_user_id: user.id, p_role: value })
      if (updateError) return setError(updateError.message)
    } else {
      if (value === 'suspended' && !canSuspendUsers) return setError('You are not authorized to suspend users.')
      if (value === 'inactive' && !canDeactivateUsers && !canEditUsers) return setError('You are not authorized to deactivate users.')
      if ((value === 'active' || value === 'pending') && !canEditUsers) return setError('You are not authorized to edit user status.')
      const { error: updateError } = await supabase.from('profiles').update({ account_status: value }).eq('id', user.id).eq('organization_id', organizationId)
      if (updateError) return setError(updateError.message)
    }
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, [field]: value } as ManagedUser : item))
    await recordActivity(organizationId, currentUserId, `User ${field} changed`, { target_user_id: user.id, value })
    setMessage(`${user.full_name} updated successfully.`)
  }

  const exportUsers = async (format: ExportFormat) => {
    if (!exportAdmin) {
      setError('Unable to identify the authenticated administrator for this export.')
      return
    }
    setExportLoading(true)
    setError('')
    const generatedAt = new Date()
    const rows = filteredUsers.map((user) => ({
      userId: user.id,
      name: user.full_name,
      employeeId: user.employee_id || '',
      department: getDepartmentLabel(user.department),
      jobTitle: user.job_title || '',
      role: USER_MANAGEMENT_BACKEND_TO_ROLE[user.role] || user.role,
      status: user.account_status,
      action: user.account_status === 'suspended' ? 'Suspended' : user.account_status === 'inactive' ? 'Deactivated' : '—',
    }))
    try {
      if (format === 'csv') exportCsv(rows, generatedAt)
      if (format === 'pdf') exportPdf(rows, exportAdmin, generatedAt)
      if (format === 'xlsx') await exportExcel(rows, exportAdmin, generatedAt)
      if (format === 'docx') await exportWord(rows, exportAdmin, generatedAt)
      await recordActivity(organizationId, currentUserId, 'User register exported', { format, record_count: rows.length })
      setMessage(`${format.toUpperCase()} user register downloaded.`)
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Unable to generate the user register.')
    } finally {
      setExportLoading(false)
    }
  }

  const filteredUsers = users.filter((user) => matchesManagedUserFilters(user, {
    query,
    role: roleFilter,
    department: departmentFilter,
    status: statusFilter,
  }))
  const activeCount = users.filter((user) => user.account_status === 'active').length
  const pendingCount = users.filter((user) => user.account_status === 'pending').length
  const restrictedCount = users.filter((user) => user.account_status === 'suspended' || user.account_status === 'inactive').length

  if (loading && users.length === 0) {
    return (
      <div className="grid gap-5">
        <PageHeader eyebrow="Administration / User management" title="User management" description="Manage organization members, roles, and account status." />
        <Skeleton className="h-20 rounded-card" />
        <Skeleton className="h-[420px] rounded-card" />
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Administration / User management"
        title="User management"
        description="Manage organization members, roles, and account status."
        actions={
          <>
            <a href="#administration" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Back to administration</a>
            {canManageRolesPermissions && (
              <a href="#roles-permissions" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Manage roles</a>
            )}
            {canInviteUsers && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowInvitations((current) => !current)
                  if (!showInvitations) void loadInvitations()
                }}
              >
                {showInvitations ? 'Hide invitations' : 'Invitations'}
              </Button>
            )}
            <ExportMenu
              label="Export users"
              busy={exportLoading}
              disabled={!exportAdmin}
              options={[
                { format: 'pdf', label: 'PDF', icon: 'fileDownload' },
                { format: 'xlsx', label: 'Excel workbook (.xlsx)', icon: 'database' },
                { format: 'docx', label: 'Word document (.docx)', icon: 'file' },
                { format: 'csv', label: 'CSV', icon: 'download' },
              ]}
              onExport={(format) => {
                if (format === 'pdf' || format === 'xlsx' || format === 'docx' || format === 'csv') void exportUsers(format)
              }}
            />
          </>
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      <section className="border-y border-line">
        <div className="grid grid-cols-2 gap-4 py-4 sm:grid-cols-4">
          <SummaryStat label="Users" value={String(users.length)} />
          <SummaryStat label="Active" value={String(activeCount)} />
          <SummaryStat label="Pending" value={String(pendingCount)} />
          <SummaryStat label="Suspended / inactive" value={String(restrictedCount)} />
        </div>
      </section>

      {canInviteUsers && (
        <InviteUserCard
          email={inviteEmail}
          onEmailChange={setInviteEmail}
          department={inviteDepartment}
          onDepartmentChange={setInviteDepartment}
          role={inviteRole}
          onRoleChange={setInviteRole}
          departments={departments}
          roleOptions={roleComboOptions}
          canManageRolesPermissions={canManageRolesPermissions}
          loading={inviteLoading}
          onSubmit={(event) => void inviteUser(event)}
          onCreateDepartment={() => {
            setDepartmentDraft('')
            setError('')
            setMessage('')
            setDepartmentModalOpen(true)
          }}
          onCreateRole={() => { setError(''); setMessage(''); setRoleDialogOpen(true) }}
        />
      )}

      <MockDataCard
        visible={canInviteUsers && organizationId === starnetMockUserBatch.organizationId}
        userLoading={mockBatchLoading}
        userResult={mockBatchResult}
        incidentLoading={mockIncidentLoading}
        incidentResult={mockIncidentResult}
        onCreateUsers={() => void createMockUserBatch()}
        onSeedIncidents={() => void seedMockIncidentBatch()}
      />

      <Card className="p-4 shadow-none">
        <div className="flex flex-wrap items-center gap-3">
          <SearchField
            className="min-w-[240px] flex-1"
            value={query}
            onChange={setQuery}
            placeholder="Search name, ID, department, or role"
            label="Search users"
          />
          <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} containerClassName="min-w-[170px]" aria-label="Filter by role">
            <option value="all">All roles</option>
            {roleComboOptions.map((role) => <option value={role.value} key={role.id}>{role.label}</option>)}
          </Select>
          <Select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} containerClassName="min-w-[190px]" aria-label="Filter by department">
            <option value="all">All departments</option>
            {departments.map((department) => <option value={department.name} key={department.name}>{department.name}</option>)}
            <option value="__unset__">Department not set</option>
          </Select>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} containerClassName="min-w-[160px]" aria-label="Filter by status">
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
            <option value="inactive">Inactive</option>
          </Select>
          <Button variant="outline" size="sm" loading={loading} onClick={() => void loadUsers()}>Refresh</Button>
        </div>
      </Card>

      <UsersTable
        users={filteredUsers}
        loading={loading}
        roleOptions={roleComboOptions}
        currentUserId={currentUserId}
        canManageUserRoles={canManageUserRoles}
        canEditUsers={canEditUsers}
        canSuspendUsers={canSuspendUsers}
        canDeactivateUsers={canDeactivateUsers}
        onUpdate={(user, field, value) => void updateUser(user, field, value)}
      />

      {showInvitations && canInviteUsers && (
        <InvitationsCard
          invitations={invitations}
          loading={invitationsLoading}
          resendingEmail={resendingEmail}
          onRefresh={() => void loadInvitations()}
          onResend={(invitation) => void resendInvitation(invitation)}
        />
      )}

      <RoleEditorDialog
        open={roleDialogOpen}
        onClose={() => setRoleDialogOpen(false)}
        organizationId={organizationId}
        onSaved={async (roleName) => {
          setInviteRole(roleName)
          await loadCustomRoles()
          setMessage(`Custom role "${roleName}" created and selected.`)
        }}
      />

      <DepartmentDialog
        open={departmentModalOpen}
        onClose={() => { setDepartmentModalOpen(false); setError(''); setMessage('') }}
        name={departmentDraft}
        setName={setDepartmentDraft}
        loading={departmentLoading}
        error={error}
        onSave={() => void saveDepartment()}
      />

      <p className="text-xs text-muted">Password resets remain server-side through Supabase Auth. The browser never receives the service-role credential.</p>
    </div>
  )
}
