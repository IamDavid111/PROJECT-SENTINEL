export type Role =
  | 'Super Administrator'
  | 'Organization Administrator'
  | 'QHSE Manager'
  | 'Site Supervisor'
  | 'Safety Officer / HSE Officer'
  | 'Auditor'
  | 'Maintenance Engineer'
  | 'Field Worker'
  | 'Contractor'
  | 'Executive / Management'

export type UserAccountStatus = 'Active' | 'Suspended' | 'Pending' | 'Inactive'

export type NotificationPreferences = {
  email: boolean
  sms: boolean
  push: boolean
  incidentAssignments: boolean
  correctiveActionReminders: boolean
  auditReminders: boolean
}

export type Organization = {
  id: string
  companyName: string
  industry: string
  companyRegistrationNumber?: string
  companyType?: string
  companySize: string
  region: string
  country: string
  state: string
  address?: string
  contactEmail: string
  contactPhone: string
  logoUrl?: string
}

export type UserProfile = {
  id: string
  fullName: string
  email: string
  employeeId?: string
  department?: string
  jobTitle?: string
  phone?: string
  emergencyContact?: string
  siteLocation?: string
  supervisor?: string
  certificationStatus?: string
  role: Role
  employmentType?: string
  accountStatus: UserAccountStatus
  organizationId: string
  photoUrl?: string
}

export type ActivityLogItem = {
  id: string
  timestamp: string
  user: string
  activity: string
  ipAddress: string
  location: string
}
