import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import type { Permission } from '../../../app/navigation'
import { FormMessage } from '../../../components/ui/form-message'
import { starnetMockUserBatch } from '../../../data/starnetMockUserBatch'
import {
  BASELINE_PERMISSION_KEYS,
  USER_ACTION_OPTIONS,
  USER_MANAGEMENT_BACKEND_TO_ROLE,
  USER_MANAGEMENT_PERMISSION_CATALOG,
  USER_MANAGEMENT_ROLE_DEFINITIONS,
} from '../../../data/userManagementConfig'
import { getEdgeFunctionErrorMessage } from '../../../lib/edgeFunctionError'
import { recordActivity } from '../../../lib/activity'
import { supabase } from '../../../lib/supabase'
import { RoleManagementSection } from '../roles/RoleManagementSection'
import { normalizeDepartmentSettings, type DepartmentOption } from '../../settings/CompanySettingsWorkspace'
import { exportCsv, exportExcel, exportPdf, exportWord } from './userExport'
import { getDepartmentLabel, matchesManagedUserFilters, permissionCatalog, type CustomRoleRecord } from './userHelpers'
import { describeInvitationExpiry, type ExportAdmin, type ExportFormat, type ExportUserRow, type ManagedUser, type OrganizationInvitation } from './types'

export function UsersWorkspace({ organizationId, currentUserId, canInviteUsers, canEditUsers, canSuspendUsers, canDeactivateUsers, canManageUserRoles, canManageRolesPermissions }: { organizationId: string; currentUserId: string; canInviteUsers: boolean; canEditUsers: boolean; canSuspendUsers: boolean; canDeactivateUsers: boolean; canManageUserRoles: boolean; canManageRolesPermissions: boolean }) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteDepartment, setInviteDepartment] = useState('')
  const [inviteRole, setInviteRole] = useState<string>('Field Worker')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const [invitationsLoading, setInvitationsLoading] = useState(false)
  const [resendingEmail, setResendingEmail] = useState<string | null>(null)
  const [showInvitations, setShowInvitations] = useState(false)
  const [mockBatchLoading, setMockBatchLoading] = useState(false)
  const [mockBatchResult, setMockBatchResult] = useState<{ createdCount: number; alreadyExistingCount: number; users: Array<{ id: string; fullName: string; email: string; role: string; department: string; siteLocation: string; employeeId: string; temporaryPassword: string | null }> } | null>(null)
  const [mockIncidentLoading, setMockIncidentLoading] = useState(false)
  const [mockIncidentResult, setMockIncidentResult] = useState<{
    batchId: string
    createdCount: number
    alreadyExistingCount: number
    tableCounts: Record<string, number>
    byStatus: Record<string, number>
    bySeverity: Record<string, number>
    byCategory: Record<string, number>
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showRoleManagement, setShowRoleManagement] = useState(false)
  const [customRoles, setCustomRoles] = useState<CustomRoleRecord[]>([])
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [roleDraft, setRoleDraft] = useState({ name: '', description: '', permissions: [...BASELINE_PERMISSION_KEYS] as Permission[] })
  const [roleDraftLoading, setRoleDraftLoading] = useState(false)
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [departmentModalOpen, setDepartmentModalOpen] = useState(false)
  const [departmentDraft, setDepartmentDraft] = useState('')
  const [departmentLoading, setDepartmentLoading] = useState(false)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf')
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

    const configuredDepartments = normalizeDepartmentSettings(data?.departments)
    setDepartments(configuredDepartments.filter((department) => department.active))
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

  // Profiles hold details such as names and account status, while memberships hold each user's organization role.
  // Load both records and join them by user ID so the table can show one combined row per user.
  const loadUsers = async () => {
    setLoading(true)
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

  const openRoleCreator = () => {
    setRoleDraft({ name: '', description: '', permissions: [...BASELINE_PERMISSION_KEYS] as Permission[] })
    setError('')
    setMessage('')
    setRoleModalOpen(true)
  }

  const toggleRolePermission = (permission: Permission) => {
    if (BASELINE_PERMISSION_KEYS.includes(permission as typeof BASELINE_PERMISSION_KEYS[number])) return
    setRoleDraft((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }))
  }

  const saveCustomRole = async () => {
    if (!roleDraft.name.trim()) {
      setError('Role name is required.')
      return
    }

    if (!roleDraft.permissions.length) {
      setError('Select at least one permission before saving.')
      return
    }

    setRoleDraftLoading(true)
    setError('')
    setMessage('')

    const { data, error: createError } = await supabase.rpc('create_custom_role', {
      p_organization_id: organizationId,
      p_name: roleDraft.name.trim(),
      p_description: roleDraft.description.trim() || null,
      p_permissions: Array.from(new Set([...BASELINE_PERMISSION_KEYS, ...roleDraft.permissions])),
      p_scope: { organizationId },
    })

    setRoleDraftLoading(false)

    if (createError) {
      setError(createError.message)
      return
    }

    const createdName = typeof data?.name === 'string' ? data.name : roleDraft.name.trim()
    setInviteRole(createdName)
    setRoleModalOpen(false)
    setRoleDraft({ name: '', description: '', permissions: [...BASELINE_PERMISSION_KEYS] as Permission[] })
    await loadCustomRoles()
    setMessage(`Custom role "${createdName}" created and selected.`)
  }

  // Ask the server-side invitation function to send the invite; after success, clear the form and reload the user list.
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
    const result = data as { createdCount: number; alreadyExistingCount: number; users: NonNullable<typeof mockBatchResult>['users'] }
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
    const result = data as NonNullable<typeof mockIncidentResult>
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

  // Save role changes through the role-update database function; account status is updated on the profile record instead.
  // Change the displayed row only after its database operation succeeds, so the UI does not show an unsaved value.
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

  const exportUsers = async () => {
    if (!exportAdmin) {
      setError('Unable to identify the authenticated administrator for this export.')
      return
    }
    setExportLoading(true)
    setError('')
    const generatedAt = new Date()
    const rows: ExportUserRow[] = filteredUsers.map((user) => ({
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
      if (exportFormat === 'csv') exportCsv(rows, generatedAt)
      if (exportFormat === 'pdf') exportPdf(rows, exportAdmin, generatedAt)
      if (exportFormat === 'xlsx') await exportExcel(rows, exportAdmin, generatedAt)
      if (exportFormat === 'docx') await exportWord(rows, exportAdmin, generatedAt)
      await recordActivity(organizationId, currentUserId, 'User register exported', { format: exportFormat, record_count: rows.length })
      setMessage(`${exportFormat.toUpperCase()} user register downloaded.`)
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

  return (
    <div className="workspace-panel users-panel">
      <div className="workspace-panel-heading">
        <div>
          <div className="eyebrow">ADMINISTRATION</div>
          <h2>User Management</h2>
          <p>Manage organization members, roles, and account status.</p>
        </div>
        <div className="workspace-panel-actions">
          <a className="button button-outline button-small" href="#administration">Back to Administration</a>
          {canManageRolesPermissions && <button className="button button-outline button-small" type="button" onClick={() => setShowRoleManagement((current) => !current)}>
            {showRoleManagement ? 'Hide roles' : 'Manage roles'}
          </button>}
          {canInviteUsers && <button className="button button-outline button-small" type="button" onClick={() => {
            setShowInvitations((current) => !current)
            if (!showInvitations) void loadInvitations()
          }}>
            {showInvitations ? 'Hide invitations' : 'Invitations'}
          </button>}
          <select className="export-format-select" value={exportFormat} onChange={(event) => setExportFormat(event.target.value as ExportFormat)} aria-label="Export format">
            <option value="pdf">PDF</option>
            <option value="xlsx">Excel</option>
            <option value="docx">Word</option>
            <option value="csv">CSV</option>
          </select>
          <button className="button button-green button-small" type="button" onClick={() => void exportUsers()} disabled={exportLoading}>{exportLoading ? 'Generating...' : 'Export users'}</button>
        </div>
      </div>
      {canInviteUsers && <form className="invite-form" onSubmit={inviteUser}>
        <div><strong>Invite a user</strong><span>Invitation emails expire after 24 hours.</span></div>
        <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} type="email" placeholder="Work email" required />
        <select value={inviteDepartment} onChange={(event) => {
          if (event.target.value === '__create_new_department__') {
            setDepartmentDraft('')
            setError('')
            setMessage('')
            setDepartmentModalOpen(true)
            return
          }
          setInviteDepartment(event.target.value)
        }}>
          <option value="">Select department</option>
          {departments.map((department) => <option value={department.name} key={department.name}>{department.name}</option>)}
          <option value="__create_new_department__">Create New Department...</option>
        </select>
        <select
          value={inviteRole}
          onChange={(event) => {
            const selectedValue = event.target.value
            if (selectedValue === '__create_new_role__') {
              openRoleCreator()
              return
            }
            setInviteRole(selectedValue)
          }}
        >
          {roleComboOptions.map((role) => <option value={role.value} key={role.id}>{role.label}</option>)}
          {canManageRolesPermissions && <option value="__create_new_role__">Create New Role...</option>}
        </select>
        <button className="button button-green button-small" disabled={inviteLoading}>{inviteLoading ? 'Sending...' : 'Send invite'}</button>
      </form>}
      {canInviteUsers && organizationId === starnetMockUserBatch.organizationId && <div className="workspace-panel-actions">
        <button className="button button-outline button-small" type="button" disabled={mockBatchLoading} onClick={() => void createMockUserBatch()}>{mockBatchLoading ? 'Creating test accounts...' : 'Create StarNet test accounts'}</button>
        <button className="button button-outline button-small" type="button" disabled={mockIncidentLoading} onClick={() => void seedMockIncidentBatch()}>{mockIncidentLoading ? 'Seeding 1,000 mock incidents...' : 'Seed 1,000 mock incidents'}</button>
      </div>}
      {mockIncidentResult && <section className="workspace-section" aria-live="polite">
        <h3>Incident batch: {mockIncidentResult.createdCount} created, {mockIncidentResult.alreadyExistingCount} already present</h3>
        <p>Batch {mockIncidentResult.batchId}; timestamps are limited to 2023-09-29 through 2026-09-29. Evidence attachments were not created.</p>
        <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Table</th><th>Rows</th></tr></thead><tbody>{Object.entries(mockIncidentResult.tableCounts).map(([table, count]) => <tr key={table}><td>{table}</td><td>{count}</td></tr>)}</tbody></table></div>
        <div className="role-permission-list">{Object.entries(mockIncidentResult.byStatus).map(([value, count]) => <span key={`status-${value}`}>Status: {value} ({count})</span>)}{Object.entries(mockIncidentResult.bySeverity).map(([value, count]) => <span key={`severity-${value}`}>Severity: {value} ({count})</span>)}{Object.entries(mockIncidentResult.byCategory).map(([value, count]) => <span key={`category-${value}`}>Category: {value} ({count})</span>)}</div>
      </section>}
      {mockBatchResult && <section className="workspace-section" aria-live="polite">
        <h3>Mock accounts: {mockBatchResult.createdCount} created, {mockBatchResult.alreadyExistingCount} already existed</h3>
        <p>New accounts have active status. Temporary passwords are shown once here; distribute them securely and rotate them after first sign-in. Password rotation is not currently enforced by the application.</p>
        <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Name / ID</th><th>Email</th><th>Role</th><th>Department</th><th>Site</th><th>One-time password</th></tr></thead><tbody>{mockBatchResult.users.map((user) => <tr key={user.id}><td><strong>{user.fullName}</strong><small>{user.id} · {user.employeeId}</small></td><td>{user.email}</td><td>{user.role}</td><td>{user.department}</td><td>{user.siteLocation}</td><td>{user.temporaryPassword ?? 'Existing account; unchanged'}</td></tr>)}</tbody></table></div>
      </section>}
      <div className="user-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, ID, department, or role" /><select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">All roles</option>{roleComboOptions.map((role) => <option value={role.value} key={role.id}>{role.label}</option>)}</select><select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="all">All departments</option>{departments.filter((department) => department.active).map((department) => <option value={department.name} key={department.name}>{department.name}</option>)}<option value="__unset__">Department not set</option></select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option></select><button className="button button-outline workspace-refresh" type="button" onClick={() => void loadUsers()}>Refresh</button></div>
      <FormMessage error={error} success={message} />
      {loading ? <div className="workspace-empty">Loading organization users...</div> : filteredUsers.length === 0 ? <div className="workspace-empty">No users match the current filters.</div> : <div className="user-table-wrap"><table className="user-table"><thead><tr><th>User</th><th>Department</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filteredUsers.map((user) => <tr key={user.id}><td><strong>{user.full_name}</strong><small>{user.employee_id || user.id}</small></td><td>{getDepartmentLabel(user.department)}</td><td><select value={user.role} disabled={user.id === currentUserId || !canManageUserRoles} onChange={(event) => void updateUser(user, 'role', event.target.value)}>{roleComboOptions.map((role) => <option value={role.value} key={role.id}>{role.label}</option>)}</select></td><td><select value={user.account_status} disabled={user.id === currentUserId || !canEditUsers} onChange={(event) => void updateUser(user, 'account_status', event.target.value)}>{!['active', 'inactive'].includes(user.account_status) && <option value={user.account_status} disabled>{user.account_status.charAt(0).toUpperCase() + user.account_status.slice(1)}</option>}<option value="active">Active</option><option value="inactive">Inactive</option></select></td><td><select aria-label={`Actions for ${user.full_name}`} defaultValue="" disabled={user.id === currentUserId || (!canSuspendUsers && !canDeactivateUsers)} onChange={(event) => { const action = event.target.value; if (action === 'Suspend' && canSuspendUsers) void updateUser(user, 'account_status', 'suspended'); if (action === 'Deactivate' && canDeactivateUsers) void updateUser(user, 'account_status', 'inactive'); event.currentTarget.value = '' }}><option value="">Select action</option>{USER_ACTION_OPTIONS.filter((action) => action === 'Suspend' ? canSuspendUsers : canDeactivateUsers).map((action) => <option value={action} key={action}>{action}</option>)}</select></td></tr>)}</tbody></table></div>}
      {showInvitations && canInviteUsers && (
        <section className="invitations-section">
          <div className="workspace-panel-heading">
            <div>
              <div className="eyebrow">INVITATIONS</div>
              <h2>Pending and recent invitations</h2>
              <p>Invitation links expire 24 hours after they are sent.</p>
            </div>
            <div className="workspace-panel-actions">
              <button className="button button-outline button-small" type="button" onClick={() => void loadInvitations()} disabled={invitationsLoading}>
                {invitationsLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
          {invitationsLoading && invitations.length === 0 ? <div className="workspace-empty">Loading invitations...</div>
            : invitations.length === 0 ? <div className="workspace-empty">No invitations have been sent yet.</div>
            : <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Invitee</th><th>Department</th><th>Role</th><th>Status</th><th>Invited by</th><th>Sent</th><th>Actions</th></tr></thead><tbody>{invitations.map((invitation) => {
              const expiryLabel = describeInvitationExpiry(invitation)
              const canResend = invitation.status === 'pending' && expiryLabel !== 'Expired'
              return <tr key={invitation.id}>
                <td><strong>{invitation.invitee_email}</strong></td>
                <td>{getDepartmentLabel(invitation.department)}</td>
                <td>{invitation.role}</td>
                <td>{invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)}{expiryLabel ? <small>{expiryLabel}</small> : null}</td>
                <td>{invitation.invited_by_name || '—'}</td>
                <td>{new Date(invitation.created_at).toLocaleString()}</td>
                <td>{canResend
                  ? <button className="button button-outline button-small" type="button" disabled={resendingEmail === invitation.invitee_email} onClick={() => void resendInvitation(invitation)}>
                    {resendingEmail === invitation.invitee_email ? 'Sending...' : 'Resend'}
                  </button>
                  : <span>—</span>}</td>
              </tr>
            })}</tbody></table></div>}
        </section>
      )}
      {showRoleManagement && canManageRolesPermissions && <RoleManagementSection organizationId={organizationId} canManage />}
      {roleModalOpen && canManageRolesPermissions && (
        <div className="role-creator-backdrop" onClick={() => setRoleModalOpen(false)}>
          <div className="role-creator-modal" onClick={(event) => event.stopPropagation()}>
            <div className="role-creator-header">
              <div>
                <div className="eyebrow">CREATE ROLE</div>
                <h3>New custom role</h3>
              </div>
              <button className="button button-outline button-small" type="button" onClick={() => setRoleModalOpen(false)}>Close</button>
            </div>
            <div className="role-creator-body">
              <label>
                Role name
                <input value={roleDraft.name} onChange={(event) => setRoleDraft((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Permit Coordinator" required />
              </label>
              <label>
                Description
                <input value={roleDraft.description} onChange={(event) => setRoleDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Optional description" />
              </label>
              <div className="permission-grid">
                {permissionCatalog.map((permission) => { const definition = USER_MANAGEMENT_PERMISSION_CATALOG.find((item) => item.key === permission); const required = BASELINE_PERMISSION_KEYS.includes(permission as typeof BASELINE_PERMISSION_KEYS[number]); return (
                  <label className={`permission-toggle${required ? ' permission-required' : ''}`} key={permission}>
                    <input type="checkbox" checked={roleDraft.permissions.includes(permission)} disabled={required} onChange={() => toggleRolePermission(permission)} />
                    <span><b>{definition?.label || permission.replaceAll('_', ' ')}{required ? ' · Required' : ''}</b><small>{definition?.description}</small></span>
                  </label>
                )})}
              </div>
            </div>
            <div className="role-creator-actions">
              <button className="button button-outline button-small" type="button" onClick={() => setRoleModalOpen(false)}>Cancel</button>
              <button className="button button-green button-small" type="button" onClick={() => void saveCustomRole()} disabled={roleDraftLoading}>{roleDraftLoading ? 'Saving...' : 'Save role'}</button>
            </div>
          </div>
        </div>
      )}
      {departmentModalOpen && (
        <div className="role-creator-backdrop" onClick={() => setDepartmentModalOpen(false)}>
          <div className="role-creator-modal" onClick={(event) => event.stopPropagation()}>
            <div className="role-creator-header">
              <div>
                <div className="eyebrow">ORGANIZATION SETTINGS</div>
                <h3>New department</h3>
              </div>
              <button className="button button-outline button-small" type="button" onClick={() => setDepartmentModalOpen(false)}>Close</button>
            </div>
            <div className="role-creator-body">
              <label>
                Department name
                <input value={departmentDraft} onChange={(event) => setDepartmentDraft(event.target.value)} placeholder="e.g. Process Safety" autoFocus required />
              </label>
            </div>
            <div className="role-creator-actions">
              <button className="button button-outline button-small" type="button" onClick={() => setDepartmentModalOpen(false)}>Cancel</button>
              <button className="button button-green button-small" type="button" onClick={() => void saveDepartment()} disabled={departmentLoading}>{departmentLoading ? 'Saving...' : 'Save department'}</button>
            </div>
          </div>
        </div>
      )}
      <p className="workspace-note">Password resets remain server-side through Supabase Auth. The browser never receives the service-role credential.</p>
    </div>
  )
}
