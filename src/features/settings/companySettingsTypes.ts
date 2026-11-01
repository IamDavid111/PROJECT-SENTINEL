import { normalizeIncidentCategoryName } from '../../lib/incidentCategory'

export type CompanyShiftSetting = {
  id: string
  name: string
  start: string
  end: string
  active: boolean
}

export type CompanySettingsState = {
  working_hours: string
  departments: string
  operational_sites: string
  emergency_contacts: string
  incident_categories: string
  risk_categories: string
  severity_levels: string
  inspection_templates: string
}

export type DepartmentOption = {
  name: string
  active: boolean
}

export type SiteOption = {
  name: string
  active: boolean
  code?: string
}

export type EmergencyContact = {
  id: string
  name: string
  role: string
  phone: string
  email: string
  active: boolean
}

export type SeverityOption = {
  name: string
  active: boolean
}

export type IncidentCategoryOption = {
  name: string
  active: boolean
}

export const defaultShiftTemplates: CompanyShiftSetting[] = [
  { id: 'day-shift', name: 'Day', start: '07:00', end: '19:00', active: true },
  { id: 'night-shift', name: 'Night', start: '19:00', end: '07:00', active: true },
]

export const defaultDepartmentSuggestions = ['Operations', 'Maintenance', 'HSE', 'Security', 'Logistics', 'Procurement', 'Admin'] as const
export const defaultSeveritySuggestions = ['Low', 'Medium', 'High', 'Critical'] as const
export const defaultIncidentCategorySuggestions = ['Near Miss', 'Unsafe Condition', 'Unsafe Act', 'Environmental Incident', 'Slip/Trip/Fall'] as const

export function normalizeDepartmentSettings(value: unknown): DepartmentOption[] {
  const source = Array.isArray(value) ? value : value && typeof value === 'object' ? ((value as Record<string, unknown>).items as unknown[] | undefined) ?? ((value as Record<string, unknown>).departments as unknown[] | undefined) ?? [] : []

  return source.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name) return []
    return [{
      name,
      active: item.active !== false,
    }]
  })
}

export function normalizeSiteSettings(value: unknown): SiteOption[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as Record<string, unknown>).items as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).sites as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).operational_sites as unknown[] | undefined)
        ?? []
      : []

  return source.flatMap((entry) => {
    if (typeof entry === 'string') {
      const name = entry.trim()
      return name ? [{ name, active: true }] : []
    }
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name) return []
    return [{
      name,
      active: item.active !== false,
      ...(typeof item.code === 'string' && item.code.trim() ? { code: item.code.trim() } : {}),
    }]
  })
}

export function normalizeEmergencyContacts(value: unknown): EmergencyContact[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as Record<string, unknown>).items as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).contacts as unknown[] | undefined)
        ?? []
      : []

  return source.flatMap((entry, index) => {
    if (typeof entry === 'string') {
      const name = entry.trim()
      return name ? [{ id: `contact-${index}-${name.toLowerCase().replace(/\s+/g, '-')}`, name, role: '', phone: '', email: '', active: true }] : []
    }
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name) return []
    return [{
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `contact-${index}-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      role: typeof item.role === 'string' ? item.role.trim() : '',
      phone: typeof item.phone === 'string' ? item.phone.trim() : '',
      email: typeof item.email === 'string' ? item.email.trim() : '',
      active: item.active !== false,
    }]
  })
}

export function normalizeSeveritySettings(value: unknown): SeverityOption[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as Record<string, unknown>).items as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).levels as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).severity_levels as unknown[] | undefined)
        ?? []
      : []

  return source.flatMap((entry) => {
    if (typeof entry === 'string') {
      const name = entry.trim()
      return name ? [{ name, active: true }] : []
    }
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    return name ? [{ name, active: item.active !== false }] : []
  })
}

export function normalizeIncidentCategorySettings(value: unknown): IncidentCategoryOption[] {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as Record<string, unknown>).items as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).categories as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).incident_categories as unknown[] | undefined)
        ?? []
      : []

  return source.flatMap((entry) => {
    const rawName = typeof entry === 'string' ? entry : entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).name === 'string' ? (entry as Record<string, unknown>).name as string : ''
    const name = normalizeIncidentCategoryName(rawName)
    if (!name) return []
    return [{ name, active: typeof entry === 'object' && entry !== null && 'active' in entry ? (entry as Record<string, unknown>).active !== false : true }]
  })
}

export function normalizeShiftSettings(value: unknown): CompanyShiftSetting[] {
  const source = (() => {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
      const candidate = value as Record<string, unknown>
      if (Array.isArray(candidate.shifts)) return candidate.shifts
    }
    return []
  })()

  return source.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const start = typeof item.start === 'string' ? item.start : ''
    const end = typeof item.end === 'string' ? item.end : ''
    if (!name) return []
    return [{
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `${name.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(16).slice(2)}`,
      name,
      start,
      end,
      active: item.active !== false,
    }]
  })
}

export function hasDuplicateNames(items: Array<{ name: string }>) {
  const names = new Set<string>()
  return items.some((item) => {
    const name = item.name.trim().toLowerCase()
    if (!name || names.has(name)) return Boolean(name)
    names.add(name)
    return false
  })
}

export function isValidEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}
