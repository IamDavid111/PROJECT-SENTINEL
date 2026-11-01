

export type ManagedUserStatus = 'active' | 'pending' | 'suspended' | 'inactive'

export type ManagedUser = {
  id: string
  full_name: string
  employee_id: string | null
  department: string | null
  job_title: string | null
  account_status: ManagedUserStatus
  role: string
}

export type OrganizationInvitation = {
  id: string
  invitee_email: string
  department: string | null
  role: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  invited_user_id: string
  inviter_id: string
  invited_by_name: string | null
  created_at: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
}

export function describeInvitationExpiry(invitation: OrganizationInvitation) {
  if (invitation.status !== 'pending') return null
  const remainingMs = new Date(invitation.expires_at).getTime() - Date.now()
  if (remainingMs <= 0) return 'Expired'
  const remainingHours = Math.floor(remainingMs / 3_600_000)
  if (remainingHours < 1) return `Expires in ${Math.max(1, Math.floor(remainingMs / 60_000))}m`
  if (remainingHours < 24) return `Expires in ${remainingHours}h`
  return `Expires in ${Math.floor(remainingHours / 24)}d`
}

export type ManagedUserFilters = {
  query: string
  role: string
  department: string
  status: string
}

export type ExportFormat = 'csv' | 'pdf' | 'xlsx' | 'docx'

export type ExportAdmin = {
  fullName: string
  role: string
  department: string | null
}

export type ExportUserRow = {
  userId: string
  name: string
  employeeId: string
  department: string
  jobTitle: string
  role: string
  status: string
  action: string
}

export type MockUserBatchUser = {
  id: string
  fullName: string
  email: string
  role: string
  department: string
  siteLocation: string
  employeeId: string
  temporaryPassword: string | null
}

export type MockUserBatchResult = {
  createdCount: number
  alreadyExistingCount: number
  users: MockUserBatchUser[]
}

export type MockIncidentBatchResult = {
  batchId: string
  createdCount: number
  alreadyExistingCount: number
  tableCounts: Record<string, number>
  byStatus: Record<string, number>
  bySeverity: Record<string, number>
  byCategory: Record<string, number>
}

