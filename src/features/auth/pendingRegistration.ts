export const pendingRegistrationKey = 'sentinel-pending-org-registration'

export type PendingRegistration = {
  companyCode?: string
  companyName?: string
  companyRegistrationNumber?: string
  companyType?: string
  industry?: string
  companySize?: string
  region?: string
  country?: string
  state?: string
  address?: string
  contactEmail?: string
  contactPhone?: string
  adminName?: string
}

export function loadPendingRegistration(): PendingRegistration {
  try {
    const raw = localStorage.getItem(pendingRegistrationKey)
    return raw ? (JSON.parse(raw) as PendingRegistration) : {}
  } catch {
    return {}
  }
}
