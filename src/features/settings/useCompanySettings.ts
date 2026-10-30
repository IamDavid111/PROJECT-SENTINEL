import { useEffect, useMemo, useState } from 'react'

import { recordActivity } from '../../lib/activity'
import { normalizeIncidentCategoryName } from '../../lib/incidentCategory'
import { supabase } from '../../lib/supabase'
import {
  defaultDepartmentSuggestions,
  defaultIncidentCategorySuggestions,
  defaultSeveritySuggestions,
  defaultShiftTemplates,
  hasDuplicateNames,
  isValidEmail,
  normalizeDepartmentSettings,
  normalizeEmergencyContacts,
  normalizeIncidentCategorySettings,
  normalizeSeveritySettings,
  normalizeShiftSettings,
  normalizeSiteSettings,
  type CompanySettingsState,
  type CompanyShiftSetting,
  type DepartmentOption,
  type EmergencyContact,
  type IncidentCategoryOption,
  type SeverityOption,
  type SiteOption,
} from './companySettingsTypes'

type SettingsSnapshot = {
  shifts: CompanyShiftSetting[]
  departments: DepartmentOption[]
  sites: SiteOption[]
  contacts: EmergencyContact[]
  severities: SeverityOption[]
  categories: IncidentCategoryOption[]
}

const emptyContact: EmergencyContact = { id: '', name: '', role: '', phone: '', email: '', active: true }
const emptyShift: CompanyShiftSetting = { id: '', name: 'Day', start: '07:00', end: '19:00', active: true }

function defaultSnapshot(): SettingsSnapshot {
  return {
    shifts: defaultShiftTemplates,
    departments: defaultDepartmentSuggestions.map((name) => ({ name, active: true })),
    sites: [],
    contacts: [],
    severities: defaultSeveritySuggestions.map((name) => ({ name, active: true })),
    categories: defaultIncidentCategorySuggestions.map((name) => ({ name, active: true })),
  }
}

export function useCompanySettings({ organizationId, userId }: { organizationId: string; userId: string }) {
  const [settings, setSettings] = useState<CompanySettingsState>({ working_hours: '{}', departments: '[]', operational_sites: '[]', emergency_contacts: '[]', incident_categories: '[]', risk_categories: '[]', severity_levels: '[]', inspection_templates: '[]' })
  const [shifts, setShifts] = useState<CompanyShiftSetting[]>(defaultShiftTemplates)
  const [departments, setDepartments] = useState<DepartmentOption[]>(defaultDepartmentSuggestions.map((name) => ({ name, active: true })))
  const [sites, setSites] = useState<SiteOption[]>([])
  const [contacts, setContacts] = useState<EmergencyContact[]>([])
  const [severities, setSeverities] = useState<SeverityOption[]>(defaultSeveritySuggestions.map((name) => ({ name, active: true })))
  const [categories, setCategories] = useState<IncidentCategoryOption[]>(defaultIncidentCategorySuggestions.map((name) => ({ name, active: true })))
  const [departmentDraft, setDepartmentDraft] = useState('')
  const [siteDraft, setSiteDraft] = useState('')
  const [siteCodeDraft, setSiteCodeDraft] = useState('')
  const [severityDraft, setSeverityDraft] = useState('')
  const [categoryDraft, setCategoryDraft] = useState('')
  const [contactDraft, setContactDraft] = useState<EmergencyContact>(emptyContact)
  const [shiftDraft, setShiftDraft] = useState<CompanyShiftSetting>(emptyShift)
  const [shiftOpen, setShiftOpen] = useState(false)
  const [siteOpen, setSiteOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [contactToRemove, setContactToRemove] = useState<EmergencyContact | null>(null)
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [baseline, setBaseline] = useState<SettingsSnapshot | null>(null)

  useEffect(() => {
    let active = true
    const loadSettings = async () => {
      setLoading(true)
      setError('')
      const { data, error: settingsError } = await supabase
        .from('company_settings')
        .select('working_hours, departments, operational_sites, emergency_contacts, incident_categories, risk_categories, severity_levels, inspection_templates')
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (!active) return
      if (settingsError) {
        setError(settingsError.message)
        setBaseline(defaultSnapshot())
        setLoading(false)
        return
      }
      if (data) {
        setSettings(Object.fromEntries(Object.entries(data).map(([key, value]) => [key, JSON.stringify(value, null, 2)])) as CompanySettingsState)
        const loadedShifts = normalizeShiftSettings(data.working_hours)
        const nextShifts = loadedShifts.length ? loadedShifts : defaultShiftTemplates
        const loadedDepartments = normalizeDepartmentSettings(data.departments)
        const nextDepartments = loadedDepartments.length ? loadedDepartments : defaultDepartmentSuggestions.map((name) => ({ name, active: true }))
        const nextSites = normalizeSiteSettings(data.operational_sites)
        const nextContacts = normalizeEmergencyContacts(data.emergency_contacts)
        const loadedSeverities = normalizeSeveritySettings(data.severity_levels)
        const nextSeverities = data.severity_levels == null ? defaultSeveritySuggestions.map((name) => ({ name, active: true })) : loadedSeverities
        const loadedCategories = normalizeIncidentCategorySettings(data.incident_categories)
        const nextCategories = data.incident_categories == null ? defaultIncidentCategorySuggestions.map((name) => ({ name, active: true })) : loadedCategories
        setShifts(nextShifts)
        setDepartments(nextDepartments)
        setSites(nextSites)
        setContacts(nextContacts)
        setSeverities(nextSeverities)
        setCategories(nextCategories)
        setBaseline({ shifts: nextShifts, departments: nextDepartments, sites: nextSites, contacts: nextContacts, severities: nextSeverities, categories: nextCategories })
      } else {
        setBaseline(defaultSnapshot())
      }
      setLoading(false)
    }
    void loadSettings()
    return () => { active = false }
  }, [organizationId])

  const snapshot = useMemo<SettingsSnapshot>(() => ({ shifts, departments, sites, contacts, severities, categories }), [shifts, departments, sites, contacts, severities, categories])
  const dirtySections = useMemo(() => {
    if (!baseline) return []
    const changed: string[] = []
    if (JSON.stringify(snapshot.shifts) !== JSON.stringify(baseline.shifts)) changed.push('shifts')
    if (JSON.stringify(snapshot.departments) !== JSON.stringify(baseline.departments)) changed.push('departments')
    if (JSON.stringify(snapshot.sites) !== JSON.stringify(baseline.sites)) changed.push('sites')
    if (JSON.stringify(snapshot.contacts) !== JSON.stringify(baseline.contacts)) changed.push('contacts')
    if (JSON.stringify(snapshot.severities) !== JSON.stringify(baseline.severities)) changed.push('severity')
    if (JSON.stringify(snapshot.categories) !== JSON.stringify(baseline.categories)) changed.push('categories')
    return changed
  }, [baseline, snapshot])
  const dirty = dirtySections.length > 0

  useEffect(() => {
    if (!dirty) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  const clearFeedback = () => {
    setError('')
    setMessage('')
  }

  const toggleShift = (id: string) => {
    clearFeedback()
    setShifts((current) => current.map((shift) => shift.id === id ? { ...shift, active: !shift.active } : shift))
  }

  const toggleDepartment = (name: string) => {
    clearFeedback()
    setDepartments((current) => current.map((department) => department.name.toLowerCase() === name.toLowerCase() ? { ...department, active: !department.active } : department))
  }

  const toggleSite = (name: string) => {
    clearFeedback()
    setSites((current) => current.map((site) => site.name.toLowerCase() === name.toLowerCase() ? { ...site, active: !site.active } : site))
  }

  const toggleContact = (id: string) => {
    clearFeedback()
    setContacts((current) => current.map((contact) => contact.id === id ? { ...contact, active: !contact.active } : contact))
  }

  const toggleSeverity = (name: string) => {
    clearFeedback()
    setSeverities((current) => current.map((severity) => severity.name.toLowerCase() === name.toLowerCase() ? { ...severity, active: !severity.active } : severity))
  }

  const toggleCategory = (name: string) => {
    clearFeedback()
    setCategories((current) => current.map((category) => category.name.toLowerCase() === name.toLowerCase() ? { ...category, active: !category.active } : category))
  }

  const addDepartment = () => {
    const name = departmentDraft.trim()
    setError('')
    setMessage('')
    if (!name) {
      setError('Department name is required.')
      return
    }
    if (departments.some((department) => department.name.toLowerCase() === name.toLowerCase())) {
      setError('That department already exists.')
      return
    }
    setDepartments((current) => [...current, { name, active: true }])
    setDepartmentDraft('')
    setMessage('Department added — save to apply.')
  }

  const openShiftEditor = (shift?: CompanyShiftSetting) => {
    setShiftDraft(shift ? { ...shift } : emptyShift)
    setEditingShiftId(shift ? shift.id : null)
    setError('')
    setMessage('')
    setShiftOpen(true)
  }

  const saveShift = () => {
    const name = shiftDraft.name.trim()
    setError('')
    if (!name) {
      setError('Shift name is required.')
      return
    }
    if (shifts.some((shift) => shift.id !== editingShiftId && shift.name.toLowerCase() === name.toLowerCase())) {
      setError('That shift already exists.')
      return
    }
    const nextShift: CompanyShiftSetting = {
      ...shiftDraft,
      id: shiftDraft.id || `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      name,
      active: shiftDraft.active !== false,
    }
    setShifts((current) => editingShiftId ? current.map((shift) => shift.id === editingShiftId ? nextShift : shift) : [...current, nextShift])
    setShiftOpen(false)
    setEditingShiftId(null)
    setShiftDraft(emptyShift)
    setMessage('Shift saved — save to apply.')
  }

  const addSite = () => {
    const name = siteDraft.trim()
    setError('')
    setMessage('')
    if (!name) {
      setError('Site name is required.')
      return
    }
    if (sites.some((site) => site.name.toLowerCase() === name.toLowerCase())) {
      setError('That site already exists.')
      return
    }
    if (!siteCodeDraft) {
      setError('Generate a site code before adding the site.')
      return
    }
    setSites((current) => [...current, { name, active: true, code: siteCodeDraft }])
    setSiteDraft('')
    setSiteCodeDraft('')
    setSiteOpen(false)
    setMessage('Site added — save to apply.')
  }

  const openContactEditor = (contact?: EmergencyContact) => {
    setContactDraft(contact ? { ...contact } : emptyContact)
    setError('')
    setMessage('')
    setContactOpen(true)
  }

  const saveContact = () => {
    const name = contactDraft.name.trim()
    const phone = contactDraft.phone.trim()
    const email = contactDraft.email.trim()
    setError('')
    if (!name || !phone) {
      setError('Contact name and phone number are required.')
      return
    }
    if (!isValidEmail(email)) {
      setError('Enter a valid contact email address.')
      return
    }
    if (contacts.some((contact) => contact.id !== contactDraft.id && contact.name.toLowerCase() === name.toLowerCase())) {
      setError('That emergency contact already exists.')
      return
    }
    const nextContact: EmergencyContact = { ...contactDraft, id: contactDraft.id || `contact-${Date.now()}`, name, role: contactDraft.role.trim(), phone, email }
    setContacts((current) => contactDraft.id ? current.map((contact) => contact.id === contactDraft.id ? nextContact : contact) : [...current, nextContact])
    setContactOpen(false)
    setMessage('Emergency contact saved — save to apply.')
  }

  const removeContact = () => {
    if (!contactToRemove) return
    setContacts((current) => current.filter((contact) => contact.id !== contactToRemove.id))
    setContactToRemove(null)
    setMessage('Emergency contact removed — save to apply.')
  }

  const addSeverity = () => {
    const name = severityDraft.trim()
    setError('')
    setMessage('')
    if (!name) {
      setError('Severity name is required.')
      return
    }
    if (severities.some((severity) => severity.name.toLowerCase() === name.toLowerCase())) {
      setError('That severity level already exists.')
      return
    }
    setSeverities((current) => [...current, { name, active: true }])
    setSeverityDraft('')
    setMessage('Severity level added — save to apply.')
  }

  const addIncidentCategory = () => {
    const name = normalizeIncidentCategoryName(categoryDraft)
    setError('')
    setMessage('')
    if (!name) {
      setError('Incident category is required.')
      return
    }
    if (categories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
      setError('That incident category already exists.')
      return
    }
    setCategories((current) => [...current, { name, active: true }])
    setCategoryDraft('')
    setMessage('Incident category added — save to apply.')
  }

  const discardChanges = () => {
    if (!baseline) return
    setShifts(baseline.shifts)
    setDepartments(baseline.departments)
    setSites(baseline.sites)
    setContacts(baseline.contacts)
    setSeverities(baseline.severities)
    setCategories(baseline.categories)
    setDepartmentDraft('')
    setSeverityDraft('')
    setCategoryDraft('')
    setShiftOpen(false)
    setSiteOpen(false)
    setContactOpen(false)
    setContactToRemove(null)
    setError('')
    setMessage('Unsaved changes discarded.')
  }

  const saveSettings = async () => {
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const nextWorkingHours = { shifts }
      const nextDepartments = departments.filter((department) => department.name.trim())
      const nextSites = sites.filter((site) => site.name.trim())
      const nextContacts = contacts.filter((contact) => contact.name.trim() && contact.phone.trim())
      const nextSeverities = severities.filter((severity) => severity.name.trim())
      const nextCategories = categories.filter((category) => category.name.trim())
      if (hasDuplicateNames(nextDepartments) || hasDuplicateNames(nextSites) || hasDuplicateNames(nextSeverities) || hasDuplicateNames(nextCategories) || hasDuplicateNames(nextContacts)) {
        setError('Duplicate configuration names are not allowed.')
        return
      }
      if (shifts.some((shift) => !shift.name.trim())) {
        setError('Each shift must have a name.')
        return
      }
      if (contacts.some((contact) => !contact.name.trim() || !contact.phone.trim() || !isValidEmail(contact.email.trim()))) {
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
      if (saveError) {
        setError(saveError.message)
        return
      }
      await recordActivity(organizationId, userId, 'Company settings changed')
      window.dispatchEvent(new CustomEvent('company-settings-updated'))
      setMessage('Company settings saved.')
      setLastSavedAt(new Date())
      setBaseline(snapshot)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save company settings.')
    } finally {
      setSaving(false)
    }
  }

  return {
    loading,
    saving,
    error,
    message,
    lastSavedAt,
    dirty,
    dirtySections,
    shifts,
    departments,
    sites,
    contacts,
    severities,
    categories,
    departmentDraft,
    setDepartmentDraft,
    siteDraft,
    setSiteDraft,
    siteCodeDraft,
    setSiteCodeDraft,
    severityDraft,
    setSeverityDraft,
    categoryDraft,
    setCategoryDraft,
    contactDraft,
    setContactDraft,
    shiftDraft,
    setShiftDraft,
    shiftOpen,
    setShiftOpen,
    siteOpen,
    setSiteOpen,
    contactOpen,
    setContactOpen,
    contactToRemove,
    setContactToRemove,
    editingShiftId,
    toggleShift,
    toggleDepartment,
    toggleSite,
    toggleContact,
    toggleSeverity,
    toggleCategory,
    addDepartment,
    addSite,
    addSeverity,
    addIncidentCategory,
    openShiftEditor,
    saveShift,
    openContactEditor,
    saveContact,
    removeContact,
    discardChanges,
    saveSettings,
    clearFeedback,
  }
}
