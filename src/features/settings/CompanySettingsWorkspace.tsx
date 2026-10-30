import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { FormMessage } from '../../components/ui/form-message'
import { recordActivity } from '../../lib/activity'
import { normalizeIncidentCategoryName } from '../../lib/incidentCategory'
import { supabase } from '../../lib/supabase'
import { SiteCodeField } from './SiteCodeField'



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

// Administrators edit organization reference lists here, including departments, sites, shifts, and incident categories.
// Other pages read these saved settings to populate their filters and forms.
export function CompanySettingsWorkspace({ organizationId, userId }: { organizationId: string; userId: string }) {
  const [settings, setSettings] = useState<CompanySettingsState>({ working_hours: '{}', departments: '[]', operational_sites: '[]', emergency_contacts: '[]', incident_categories: '[]', risk_categories: '[]', severity_levels: '[]', inspection_templates: '[]' })
  const [shiftSettings, setShiftSettings] = useState<CompanyShiftSetting[]>(defaultShiftTemplates)
  const [departmentSettings, setDepartmentSettings] = useState<DepartmentOption[]>(defaultDepartmentSuggestions.map((name) => ({ name, active: true })))
  const [siteSettings, setSiteSettings] = useState<SiteOption[]>([])
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([])
  const [severitySettings, setSeveritySettings] = useState<SeverityOption[]>(defaultSeveritySuggestions.map((name) => ({ name, active: true })))
  const [incidentCategorySettings, setIncidentCategorySettings] = useState<IncidentCategoryOption[]>(defaultIncidentCategorySuggestions.map((name) => ({ name, active: true })))
  const [departmentDraft, setDepartmentDraft] = useState('')
  const [siteDraft, setSiteDraft] = useState('')
  const [siteCodeDraft, setSiteCodeDraft] = useState('')
  const [severityDraft, setSeverityDraft] = useState('')
  const [incidentCategoryDraft, setIncidentCategoryDraft] = useState('')
  const [contactDraft, setContactDraft] = useState<EmergencyContact>({ id: '', name: '', role: '', phone: '', email: '', active: true })
  const [shiftDraft, setShiftDraft] = useState<CompanyShiftSetting>({ id: '', name: 'Day', start: '07:00', end: '19:00', active: true })
  const [shiftModalOpen, setShiftModalOpen] = useState(false)
  const [siteModalOpen, setSiteModalOpen] = useState(false)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [contactToRemove, setContactToRemove] = useState<EmergencyContact | null>(null)
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadSettings = async () => {
      const { data, error: settingsError } = await supabase.from('company_settings').select('working_hours, departments, operational_sites, emergency_contacts, incident_categories, risk_categories, severity_levels, inspection_templates').eq('organization_id', organizationId).maybeSingle()
      if (settingsError) setError(settingsError.message)
      else if (data) {
        const nextSettings = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, JSON.stringify(value, null, 2)])) as CompanySettingsState
        setSettings(nextSettings)
        const loadedShifts = normalizeShiftSettings(data.working_hours)
        setShiftSettings(loadedShifts.length ? loadedShifts : defaultShiftTemplates)
        const loadedDepartments = normalizeDepartmentSettings(data.departments)
        setDepartmentSettings(loadedDepartments.length ? loadedDepartments : defaultDepartmentSuggestions.map((name) => ({ name, active: true })))
        const loadedSites = normalizeSiteSettings(data.operational_sites)
        setSiteSettings(loadedSites)
        setEmergencyContacts(normalizeEmergencyContacts(data.emergency_contacts))
        const loadedSeverities = normalizeSeveritySettings(data.severity_levels)
        setSeveritySettings(data.severity_levels == null ? defaultSeveritySuggestions.map((name) => ({ name, active: true })) : loadedSeverities)
        const loadedCategories = normalizeIncidentCategorySettings(data.incident_categories)
        setIncidentCategorySettings(data.incident_categories == null ? defaultIncidentCategorySuggestions.map((name) => ({ name, active: true })) : loadedCategories)
      }
      setLoading(false)
    }
    void loadSettings()
  }, [organizationId])

  const syncJsonSetting = <T,>(key: keyof CompanySettingsState, value: T) => {
    setSettings((current) => ({ ...current, [key]: JSON.stringify(value, null, 2) }))
  }

  const syncDepartmentSettings = (next: DepartmentOption[]) => {
    setDepartmentSettings(next)
    syncJsonSetting('departments', next)
  }

  const addDepartment = () => {
    const name = departmentDraft.trim()
    if (!name) {
      setError('Department name is required.')
      return
    }
    if (departmentSettings.some((department) => department.name.toLowerCase() === name.toLowerCase())) {
      setError('That department already exists.')
      return
    }

    const next = [...departmentSettings, { name, active: true }]
    syncDepartmentSettings(next)
    setDepartmentDraft('')
    setMessage('Department added.')
  }

  const toggleDepartment = (name: string) => {
    setDepartmentSettings((current) => {
      const next = current.map((department) => department.name.toLowerCase() === name.toLowerCase() ? { ...department, active: !department.active } : department)
      syncJsonSetting('departments', next)
      return next
    })
  }

  const syncSiteSettings = (next: SiteOption[]) => {
    setSiteSettings(next)
    syncJsonSetting('operational_sites', next)
  }

  const addSite = () => {
    const name = siteDraft.trim()
    if (!name) {
      setError('Site name is required.')
      return
    }
    if (siteSettings.some((site) => site.name.toLowerCase() === name.toLowerCase())) {
      setError('That site already exists.')
      return
    }
    if (!siteCodeDraft) {
      setError('Generate a site code before adding the site.')
      return
    }

    const next = [...siteSettings, { name, active: true, code: siteCodeDraft }]
    syncSiteSettings(next)
    setSiteDraft('')
    setSiteCodeDraft('')
    setSiteModalOpen(false)
    setMessage('Site added.')
  }

  const toggleSite = (name: string) => {
    setSiteSettings((current) => {
      const next = current.map((site) => site.name.toLowerCase() === name.toLowerCase() ? { ...site, active: !site.active } : site)
      syncJsonSetting('operational_sites', next)
      return next
    })
  }

  const openContactEditor = (contact?: EmergencyContact) => {
    setContactDraft(contact ? { ...contact } : { id: '', name: '', role: '', phone: '', email: '', active: true })
    setError('')
    setMessage('')
    setContactModalOpen(true)
  }

  const saveContact = () => {
    const name = contactDraft.name.trim()
    const phone = contactDraft.phone.trim()
    const email = contactDraft.email.trim()
    if (!name || !phone) {
      setError('Contact name and phone number are required.')
      return
    }
    if (!isValidEmail(email)) {
      setError('Enter a valid contact email address.')
      return
    }
    if (emergencyContacts.some((contact) => contact.id !== contactDraft.id && contact.name.toLowerCase() === name.toLowerCase())) {
      setError('That emergency contact already exists.')
      return
    }

    const nextContact: EmergencyContact = { ...contactDraft, id: contactDraft.id || `contact-${Date.now()}`, name, role: contactDraft.role.trim(), phone, email }
    setEmergencyContacts((current) => {
      const next = contactDraft.id ? current.map((contact) => contact.id === contactDraft.id ? nextContact : contact) : [...current, nextContact]
      syncJsonSetting('emergency_contacts', next)
      return next
    })
    setContactModalOpen(false)
    setMessage('Emergency contact saved.')
  }

  const removeContact = () => {
    if (!contactToRemove) return
    setEmergencyContacts((current) => {
      const next = current.filter((contact) => contact.id !== contactToRemove.id)
      syncJsonSetting('emergency_contacts', next)
      return next
    })
    setContactToRemove(null)
    setMessage('Emergency contact removed.')
  }

  const addSeverity = () => {
    const name = severityDraft.trim()
    if (!name) {
      setError('Severity name is required.')
      return
    }
    if (severitySettings.some((severity) => severity.name.toLowerCase() === name.toLowerCase())) {
      setError('That severity level already exists.')
      return
    }
    setSeveritySettings((current) => {
      const next = [...current, { name, active: true }]
      syncJsonSetting('severity_levels', next)
      return next
    })
    setSeverityDraft('')
    setMessage('Severity level added.')
  }

  const toggleSeverity = (name: string) => {
    setSeveritySettings((current) => {
      const next = current.map((severity) => severity.name.toLowerCase() === name.toLowerCase() ? { ...severity, active: !severity.active } : severity)
      syncJsonSetting('severity_levels', next)
      return next
    })
  }

  const addIncidentCategory = () => {
    const name = normalizeIncidentCategoryName(incidentCategoryDraft)
    if (!name) {
      setError('Incident category is required.')
      return
    }
    if (incidentCategorySettings.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      setError('That incident category already exists.')
      return
    }
    setIncidentCategorySettings((current) => {
      const next = [...current, { name, active: true }]
      syncJsonSetting('incident_categories', next)
      return next
    })
    setIncidentCategoryDraft('')
    setMessage('Incident category added.')
  }

  const toggleIncidentCategory = (name: string) => {
    setIncidentCategorySettings((current) => {
      const next = current.map((category) => category.name.toLowerCase() === name.toLowerCase() ? { ...category, active: !category.active } : category)
      syncJsonSetting('incident_categories', next)
      return next
    })
  }

  const openShiftEditor = (shift?: CompanyShiftSetting) => {
    setShiftDraft(shift ? { ...shift } : { id: '', name: 'Day', start: '07:00', end: '19:00', active: true })
    setEditingShiftId(shift ? shift.id : null)
    setError('')
    setMessage('')
    setShiftModalOpen(true)
  }

  const saveShift = () => {
    const name = shiftDraft.name.trim()
    if (!name) {
      setError('Shift name is required.')
      return
    }
    if (shiftSettings.some((shift) => shift.id !== editingShiftId && shift.name.toLowerCase() === name.toLowerCase())) {
      setError('That shift already exists.')
      return
    }

    const nextShift: CompanyShiftSetting = {
      ...shiftDraft,
      id: shiftDraft.id || `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      name,
      active: shiftDraft.active !== false,
    }

    setShiftSettings((current) => {
      const next = editingShiftId ? current.map((shift) => shift.id === editingShiftId ? nextShift : shift) : [...current, nextShift]
      syncJsonSetting('working_hours', { shifts: next })
      return next
    })

    setShiftModalOpen(false)
    setEditingShiftId(null)
    setShiftDraft({ id: '', name: 'Day', start: '07:00', end: '19:00', active: true })
    setMessage('Shift saved.')
  }

  // Validate the edited values, save them as structured settings, and create database site rows for any newly added sites.
  // Notify other screens afterward so dashboard filters and emergency-contact displays can refresh without a full reload.
  const saveSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')

    const nextWorkingHours = { shifts: shiftSettings }
    const nextDepartments = departmentSettings.filter((department) => department.name.trim())
    const nextSites = siteSettings.filter((site) => site.name.trim())
    const nextContacts = emergencyContacts.filter((contact) => contact.name.trim() && contact.phone.trim())
    const nextSeverities = severitySettings.filter((severity) => severity.name.trim())
    const nextCategories = incidentCategorySettings.filter((category) => category.name.trim())
    if (hasDuplicateNames(nextDepartments) || hasDuplicateNames(nextSites) || hasDuplicateNames(nextSeverities) || hasDuplicateNames(nextCategories) || hasDuplicateNames(nextContacts)) {
      setError('Duplicate configuration names are not allowed.')
      return
    }
    if (shiftSettings.some((shift) => !shift.name.trim())) {
      setError('Each shift must have a name.')
      return
    }
    if (emergencyContacts.some((contact) => !contact.name.trim() || !contact.phone.trim() || !isValidEmail(contact.email.trim()))) {
      setError('Each emergency contact requires a name, phone number, and valid email if provided.')
      return
    }
    const mergedSettings = {
      ...settings,
      working_hours: JSON.stringify(nextWorkingHours, null, 2),
      departments: JSON.stringify(nextDepartments, null, 2),
      operational_sites: JSON.stringify(nextSites, null, 2),
      emergency_contacts: JSON.stringify(nextContacts, null, 2),
      incident_categories: JSON.stringify(nextCategories, null, 2),
      risk_categories: settings.risk_categories || JSON.stringify([], null, 2),
      severity_levels: JSON.stringify(nextSeverities, null, 2),
      inspection_templates: settings.inspection_templates || JSON.stringify([], null, 2),
    }

    let parsed: Record<string, unknown>
    try {
      parsed = Object.fromEntries(Object.entries(mergedSettings).map(([key, value]) => [key, JSON.parse(value)]))
    } catch {
      setError('Each settings field must contain valid JSON.')
      return
    }

    const { data: existingSites, error: existingSitesError } = await supabase
      .from('sites')
      .select('id, name')
      .eq('organization_id', organizationId)
    if (existingSitesError) {
      setError(`Unable to synchronize organization sites: ${existingSitesError.message}`)
      return
    }

    const existingSiteNames = new Set((existingSites || []).map((site) => site.name.trim().toLowerCase()))
    const sitesToCreate = nextSites.filter((site) => !existingSiteNames.has(site.name.trim().toLowerCase()))
    if (sitesToCreate.length) {
      const { error: siteSyncError } = await supabase.from('sites').insert(sitesToCreate.map((site) => ({
        organization_id: organizationId,
        name: site.name.trim(),
        ...(site.code ? { code: site.code } : {}),
      })))
      if (siteSyncError) {
        setError(`Unable to synchronize organization sites: ${siteSyncError.message}`)
        return
      }
    }

    const { error: saveError } = await supabase.from('company_settings').upsert({ organization_id: organizationId, ...parsed })
    if (saveError) setError(saveError.message)
    else {
      await recordActivity(organizationId, userId, 'Company settings changed')
      window.dispatchEvent(new CustomEvent('company-settings-updated'))
      setMessage('Company settings saved.')
    }
  }

  if (loading) return <div className="workspace-panel">Loading company settings...</div>

  const fields: [keyof CompanySettingsState, string][] = []

  return <div className="workspace-panel settings-panel"><div className="eyebrow">ORGANIZATION CONFIGURATION</div><h2>Company Settings</h2><p>Maintain the organization reference data used by operational workflows. Values are stored as structured JSON.</p><form className="settings-form" onSubmit={saveSettings}><label>Shift<div className="shift-config-list">{shiftSettings.length ? shiftSettings.map((shift) => <div className="shift-config-item" key={shift.id}><div><strong>{shift.name}</strong><small>{shift.active ? 'Enabled' : 'Disabled'}</small></div><div className="shift-config-actions"><label className="switch"><input type="checkbox" checked={shift.active} onChange={() => setShiftSettings((current) => current.map((item) => item.id === shift.id ? { ...item, active: !item.active } : item))} /><span /></label><button className="button button-outline button-small" type="button" onClick={() => openShiftEditor(shift)}>Change shift</button></div></div>) : <div className="workspace-empty">No shifts configured.</div>}</div><div className="shift-config-footer"><button className="button button-outline button-small" type="button" onClick={() => openShiftEditor()}>Add shift</button></div></label><label>Departments<div className="shift-config-list">{departmentSettings.length ? departmentSettings.map((department) => <div className="shift-config-item" key={department.name}><div><strong>{department.name}</strong><small>{department.active ? 'Active' : 'Disabled'}</small></div><div className="shift-config-actions"><label className="switch"><input type="checkbox" checked={department.active} onChange={() => toggleDepartment(department.name)} /><span /></label></div></div>) : <div className="workspace-empty">No departments configured.</div>}</div><div className="shift-config-footer"><input value={departmentDraft} onChange={(event) => setDepartmentDraft(event.target.value)} placeholder="Add custom department" /><button className="button button-outline button-small" type="button" onClick={addDepartment}>Add department</button></div></label><label>Sites<div className="shift-config-list">{siteSettings.length ? siteSettings.map((site) => <div className="shift-config-item" key={site.name}><div><strong>{site.name}</strong><small>{site.active ? 'Active' : 'Disabled'}</small></div><div className="shift-config-actions"><label className="switch"><input type="checkbox" checked={site.active} onChange={() => toggleSite(site.name)} /><span /></label></div></div>) : <div className="workspace-empty">No sites configured.</div>}</div><div className="shift-config-footer"><button className="button button-outline button-small" type="button" onClick={() => { setSiteDraft(''); setSiteCodeDraft(''); setError(''); setMessage(''); setSiteModalOpen(true) }}>Add site</button></div></label><label>Emergency contacts<div className="shift-config-list">{emergencyContacts.length ? emergencyContacts.map((contact) => <div className="shift-config-item" key={contact.id}><div><strong>{contact.name}</strong><small>{[contact.role, contact.phone].filter(Boolean).join(' · ') || 'Contact details not set'}{contact.active ? '' : ' · Disabled'}</small></div><div className="shift-config-actions"><label className="switch"><input type="checkbox" checked={contact.active} onChange={() => setEmergencyContacts((current) => current.map((item) => item.id === contact.id ? { ...item, active: !item.active } : item))} /><span /></label><button className="button button-outline button-small" type="button" onClick={() => openContactEditor(contact)}>Edit</button><button className="button button-outline button-small" type="button" onClick={() => setContactToRemove(contact)}>Remove</button></div></div>) : <div className="workspace-empty">No emergency contacts configured.</div>}</div><div className="shift-config-footer"><button className="button button-outline button-small" type="button" onClick={() => openContactEditor()}>Add contact</button></div></label><label>Severity levels<div className="shift-config-list">{severitySettings.map((severity) => <div className="shift-config-item" key={severity.name}><div><strong>{severity.name}</strong><small>{severity.active ? 'Enabled' : 'Disabled'}</small></div><label className="switch"><input type="checkbox" checked={severity.active} onChange={() => toggleSeverity(severity.name)} /><span /></label></div>)}</div><div className="shift-config-footer"><input value={severityDraft} onChange={(event) => setSeverityDraft(event.target.value)} placeholder="Add custom severity" /><button className="button button-outline button-small" type="button" onClick={addSeverity}>Add severity</button></div></label><label>Incident categories<div className="shift-config-list">{incidentCategorySettings.map((category) => <div className="shift-config-item" key={category.name}><div><strong>{category.name}</strong><small>{category.active ? "Enabled" : "Disabled"}</small></div><label className="switch"><input type="checkbox" checked={category.active} onChange={() => toggleIncidentCategory(category.name)} /><span /></label></div>)}</div><div className="shift-config-footer"><input value={incidentCategoryDraft} onChange={(event) => setIncidentCategoryDraft(event.target.value)} placeholder="Add custom category" /><button className="button button-outline button-small" type="button" onClick={addIncidentCategory}>Add category</button></div></label>{fields.map(([key, label]) => <label key={key}>{label}<textarea value={settings[key]} onChange={(event) => setSettings((current) => ({ ...current, [key]: event.target.value }))} rows={4} spellCheck={false} /></label>)}<FormMessage error={error} success={message} /><button className="button button-green auth-submit">Save company settings</button></form>{shiftModalOpen && <div className="role-creator-backdrop" onClick={() => setShiftModalOpen(false)}><div className="role-creator-modal" onClick={(event) => event.stopPropagation()}><div className="role-creator-header"><div><div className="eyebrow">SHIFT SETTINGS</div><h3>{editingShiftId ? 'Edit shift' : 'Add shift'}</h3></div><button className="button button-outline button-small" type="button" onClick={() => setShiftModalOpen(false)}>Close</button></div><div className="role-creator-body"><label>Shift name<input value={shiftDraft.name} onChange={(event) => setShiftDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Day" required /></label><label className="preference-row"><span><strong>Enabled</strong><small>Show this shift in active options</small></span><input type="checkbox" checked={shiftDraft.active} onChange={(event) => setShiftDraft((current) => ({ ...current, active: event.target.checked }))} /></label></div><div className="role-creator-actions"><button className="button button-outline button-small" type="button" onClick={() => setShiftModalOpen(false)}>Cancel</button><button className="button button-green button-small" type="button" onClick={saveShift}>Save shift</button></div></div></div>}{siteModalOpen && <div className="role-creator-backdrop" onClick={() => setSiteModalOpen(false)}><div className="role-creator-modal" onClick={(event) => event.stopPropagation()}><div className="role-creator-header"><div><div className="eyebrow">SITE SETTINGS</div><h3>New site</h3></div><button className="button button-outline button-small" type="button" onClick={() => setSiteModalOpen(false)}>Close</button></div><div className="role-creator-body"><label>Site name<input value={siteDraft} onChange={(event) => setSiteDraft(event.target.value)} placeholder="Main Plant" required /></label><SiteCodeField organizationId={organizationId} value={siteCodeDraft} onChange={setSiteCodeDraft} /></div><div className="role-creator-actions"><button className="button button-outline button-small" type="button" onClick={() => setSiteModalOpen(false)}>Cancel</button><button className="button button-green button-small" type="button" onClick={addSite}>Add site</button></div></div></div>}{contactModalOpen && <div className="role-creator-backdrop" onClick={() => setContactModalOpen(false)}><div className="role-creator-modal" onClick={(event) => event.stopPropagation()}><div className="role-creator-header"><div><div className="eyebrow">EMERGENCY CONTACTS</div><h3>{contactDraft.id ? 'Edit contact' : 'Add contact'}</h3></div><button className="button button-outline button-small" type="button" onClick={() => setContactModalOpen(false)}>Close</button></div><div className="role-creator-body"><label>Contact name<input value={contactDraft.name} onChange={(event) => setContactDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Control room" required /></label><label>Role or service<input value={contactDraft.role} onChange={(event) => setContactDraft((current) => ({ ...current, role: event.target.value }))} placeholder="Emergency response" /></label><label>Phone number<input value={contactDraft.phone} onChange={(event) => setContactDraft((current) => ({ ...current, phone: event.target.value }))} placeholder="+234 ..." required /></label><label>Email address<input value={contactDraft.email} onChange={(event) => setContactDraft((current) => ({ ...current, email: event.target.value }))} type="email" placeholder="control-room@company.com" /></label><label className="preference-row"><span><strong>Enabled</strong><small>Show this contact on the dashboard</small></span><input type="checkbox" checked={contactDraft.active} onChange={(event) => setContactDraft((current) => ({ ...current, active: event.target.checked }))} /></label></div><div className="role-creator-actions"><button className="button button-outline button-small" type="button" onClick={() => setContactModalOpen(false)}>Cancel</button><button className="button button-green button-small" type="button" onClick={saveContact}>Save contact</button></div></div></div>}{contactToRemove && <div className="role-creator-backdrop" onClick={() => setContactToRemove(null)}><div className="role-creator-modal" onClick={(event) => event.stopPropagation()}><div className="role-creator-header"><div><div className="eyebrow">CONFIRM REMOVAL</div><h3>Remove {contactToRemove.name}?</h3></div><button className="button button-outline button-small" type="button" onClick={() => setContactToRemove(null)}>Close</button></div><div className="role-creator-body"><p>This contact will be removed from the organization emergency contacts list.</p></div><div className="role-creator-actions"><button className="button button-outline button-small" type="button" onClick={() => setContactToRemove(null)}>Cancel</button><button className="button button-green button-small" type="button" onClick={removeContact}>Remove contact</button></div></div></div>}</div>
}

