import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { SupabaseClient } from '@supabase/supabase-js'

import { incidentFormSchema, incidentSubmissionSchema, type IncidentFormValues } from './incidentSchemas'
import { useCreateIncidentDraft, useIncidentOrganization, useSubmitIncident, useUpdateIncidentDraft, useUploadIncidentEvidence } from './useIncidentData'
import type { IncidentDetail, IncidentDraftInput, IncidentReportType, IncidentSubmissionInput } from './incidentTypes'

const fallbackSeverities = ['low', 'medium', 'high', 'critical']
const fallbackIncidentCategories = ['Near Miss', 'Unsafe Condition', 'Unsafe Act', 'Environmental Incident', 'Slip/Trip/Fall']
const stages = ['Event', 'Location & context', 'People', 'Evidence & sign-off'] as const

type SiteOption = { id: string; name: string }
type FacilityOption = { id: string; name: string; site_id: string }

function configuredOptions(value: unknown, fallback: string[], legacyValue = '') {
  if (!Array.isArray(value)) return legacyValue ? [legacyValue] : fallback
  const options = value.flatMap((item) => {
    if (typeof item === 'string') return [item.trim()].filter(Boolean)
    if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string' && (!('active' in item) || item.active !== false)) return [item.name.trim()].filter(Boolean)
    return []
  })
  if (legacyValue && !options.some((option) => option.toLowerCase() === legacyValue.toLowerCase())) options.push(legacyValue)
  return options.length ? options : legacyValue ? [legacyValue] : fallback
}

function normalizeIncidentCategoryName(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ')
  const legacyMap: Record<string, string> = {
    'near miss': 'Near Miss',
    'near-miss': 'Near Miss',
    'unsafe condition': 'Unsafe Condition',
    'unsafe act': 'Unsafe Act',
    'environmental incident': 'Environmental Incident',
    'environmental event': 'Environmental Incident',
    'slip trip fall': 'Slip/Trip/Fall',
    'slip/trip/fall': 'Slip/Trip/Fall',
  }
  return legacyMap[normalized] || value.trim()
}

function configuredIncidentCategories(value: unknown, legacyValue = '') {
  if (!Array.isArray(value)) return legacyValue ? [normalizeIncidentCategoryName(legacyValue)] : fallbackIncidentCategories
  const options = value.flatMap((item) => {
    const rawName = typeof item === 'string' ? item : item && typeof item === 'object' && typeof (item as Record<string, unknown>).name === 'string' ? (item as Record<string, unknown>).name as string : ''
    if (!rawName || (typeof item === 'object' && item !== null && 'active' in item && (item as Record<string, unknown>).active === false)) return []
    const name = normalizeIncidentCategoryName(rawName)
    return name ? [name] : []
  })
  const normalizedLegacy = legacyValue ? normalizeIncidentCategoryName(legacyValue) : ''
  if (normalizedLegacy && !options.some((option) => option.toLowerCase() === normalizedLegacy.toLowerCase())) options.push(normalizedLegacy)
  return options.length ? options : normalizedLegacy ? [normalizedLegacy] : []
}

function configuredSiteNames(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const rawName = typeof item === 'string' ? item : item && typeof item === 'object' && typeof (item as Record<string, unknown>).name === 'string' ? (item as Record<string, unknown>).name as string : ''
    if (!rawName || (typeof item === 'object' && item !== null && 'active' in item && (item as Record<string, unknown>).active === false)) return []
    return rawName.trim() ? [rawName.trim()] : []
  })
}

function fieldError(message?: string) {
  return message ? <span className="incident-field-error" role="alert">{message}</span> : null
}

function combineOccurrenceDateTime(values: IncidentFormValues) {
  if (!values.occurrenceDate || !values.occurrenceTime) return undefined
  const date = new Date(`${values.occurrenceDate}T${values.occurrenceTime}`)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function toDraftInput(values: IncidentFormValues): IncidentDraftInput {
  return {
    reportType: values.reportType,
    title: values.title,
    description: values.description,
    occurredAt: combineOccurrenceDateTime(values),
    siteId: values.siteId,
    facilityId: values.facilityId,
    location: values.location,
    department: values.department,
    workActivityContext: values.workActivityContext,
    severity: values.severity,
    potentialSeverity: values.potentialSeverity,
    incidentCategory: values.incidentCategory,
    contractorInvolved: values.contractorInvolved,
    contractorOrganization: values.contractorOrganization,
    environmentalImpact: values.environmentalImpact,
    injuryOrIllness: values.injuryOrIllness,
    propertyDamage: values.propertyDamage,
    workRelated: values.workRelated,
    immediateCorrection: values.immediateCorrection,
    priority: values.priority,
    gpsCoordinates: values.gpsCoordinates,
    weatherConditions: values.weatherConditions,
    equipmentInvolved: values.equipmentInvolved,
    peopleInvolved: values.peopleInvolved,
    witnesses: values.witnesses,
    potentialRootCause: values.potentialRootCause,
    digitalSignature: values.digitalSignature,
    accuracyConfirmed: values.accuracyConfirmed,
  }
}

export function IncidentReportForm({ supabase, reportType, initialTitle, initialCategory, initialEnvironmentalImpact, draftId: existingDraftId, initialIncident, onBack }: { supabase: SupabaseClient; reportType: IncidentReportType; initialTitle?: string; initialCategory?: string; initialEnvironmentalImpact?: boolean; draftId?: string; initialIncident?: IncidentDetail; onBack: () => void }) {
  const organization = useIncidentOrganization(supabase)
  const [sites, setSites] = useState<SiteOption[]>([])
  const [facilities, setFacilities] = useState<FacilityOption[]>([])
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [draftId, setDraftId] = useState<string | null>(existingDraftId || null)
  const [draftReference, setDraftReference] = useState(existingDraftId ? (initialIncident?.referenceNumber || '') : '')
  const [activeStage, setActiveStage] = useState(0)
  const [fieldMode, setFieldMode] = useState(false)
  const createDraft = useCreateIncidentDraft(supabase)
  const updateDraft = useUpdateIncidentDraft(supabase)
  const submitIncident = useSubmitIncident(supabase)
  const uploadEvidence = useUploadIncidentEvidence(supabase)
  const form = useForm<IncidentFormValues>({
    resolver: zodResolver(incidentFormSchema),
    defaultValues: {
      reportType,
      title: initialTitle || '',
      incidentCategory: initialCategory || '',
      contractorInvolved: false,
      environmentalImpact: initialEnvironmentalImpact !== undefined ? initialEnvironmentalImpact : (reportType === 'environmental_incident'),
      injuryOrIllness: false,
      propertyDamage: false,
      workRelated: true,
      priority: '',
      gpsCoordinates: '',
      weatherConditions: '',
      equipmentInvolved: '',
      peopleInvolved: '',
      witnesses: '',
      potentialRootCause: '',
      digitalSignature: '',
      accuracyConfirmed: false,
      affectedPersonName: '',
      affectedPersonOrganization: '',
      witnessName: '',
      witnessOrganization: '',
      witnessContactDetails: '',
    },
  })
  const selectedSite = form.watch('siteId')
  const selectedSeverity = form.watch('severity')
  const selectedCategory = form.watch('incidentCategory')

  useEffect(() => {
    if (!initialIncident) return
    const occurred = initialIncident.occurredAt ? new Date(initialIncident.occurredAt) : null
    form.reset({
      reportType: initialIncident.reportType,
      title: initialIncident.title,
      description: initialIncident.description || '',
      occurrenceDate: occurred && !Number.isNaN(occurred.getTime()) ? occurred.toISOString().slice(0, 10) : '',
      occurrenceTime: occurred && !Number.isNaN(occurred.getTime()) ? occurred.toTimeString().slice(0, 5) : '',
      siteId: initialIncident.siteId || '',
      facilityId: initialIncident.facilityId || '',
      location: initialIncident.location || '',
      department: initialIncident.department || '',
      workActivityContext: initialIncident.workActivityContext || '',
      severity: initialIncident.severity || '',
      potentialSeverity: initialIncident.potentialSeverity || '',
      incidentCategory: initialIncident.incidentCategory || '',
      contractorInvolved: initialIncident.contractorInvolved,
      contractorOrganization: initialIncident.contractorOrganization || '',
      environmentalImpact: initialIncident.environmentalImpact,
      injuryOrIllness: initialIncident.injuryOrIllness,
      propertyDamage: initialIncident.propertyDamage,
      workRelated: initialIncident.workRelated,
      immediateCorrection: initialIncident.immediateCorrection || '',
      priority: '',
      gpsCoordinates: '',
      weatherConditions: '',
      equipmentInvolved: '',
      peopleInvolved: '',
      witnesses: '',
      potentialRootCause: '',
      digitalSignature: '',
      accuracyConfirmed: false,
    })
  }, [form, initialIncident])

  useEffect(() => {
    if (!organization.data?.organizationId) return
    let active = true
    void Promise.all([
      supabase.from('sites').select('id, name').eq('organization_id', organization.data.organizationId).order('name'),
      supabase.from('facilities').select('id, name, site_id').eq('organization_id', organization.data.organizationId).order('name'),
      supabase.from('company_settings').select('departments, operational_sites, incident_categories, severity_levels').eq('organization_id', organization.data.organizationId).maybeSingle(),
    ]).then(([siteResult, facilityResult, settingsResult]) => {
      if (!active) return
      setSites(siteResult.data || [])
      setFacilities(facilityResult.data || [])
      setSettings(settingsResult.data || {})
    })
    return () => { active = false }
  }, [organization.data?.organizationId, supabase])

  const availableFacilities = facilities.filter((facility) => facility.site_id === selectedSite)
  const configuredSites = settings.operational_sites === undefined ? sites : sites.filter((site) => configuredSiteNames(settings.operational_sites).some((name) => name.toLowerCase() === site.name.toLowerCase()))
  const departments = configuredOptions(settings.departments, [])
  const categories = settings.incident_categories === undefined
    ? fallbackIncidentCategories
    : configuredIncidentCategories(settings.incident_categories, selectedCategory)
  const severities = settings.severity_levels === undefined
    ? fallbackSeverities
    : configuredOptions(settings.severity_levels, [], selectedSeverity)

  const isSaving = createDraft.isPending || updateDraft.isPending
  const isSubmitting = submitIncident.isPending
  const isBusy = isSaving || isSubmitting

  const saveDraft = form.handleSubmit(async (values) => {
    setSubmitError('')
    setSubmitMessage('')
    try {
      const input = toDraftInput(values)
      const saved = draftId ? await updateDraft.mutateAsync({ incidentId: draftId, input }) : await createDraft.mutateAsync(input)
      setDraftId(saved.id)
      setDraftReference(saved.referenceNumber)
      setSubmitMessage(`Draft ${saved.referenceNumber} saved. You can continue it later.`)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save the draft.')
    }
  }, () => {
    setSubmitError('Please correct the highlighted fields before saving the draft.')
    setSubmitMessage('')
  })

  const submitReport = form.handleSubmit(async (values) => {
    setSubmitError('')
    setSubmitMessage('')
    const candidate: IncidentSubmissionInput = {
      ...toDraftInput(values),
      title: values.title || '',
      description: values.description || '',
      occurredAt: combineOccurrenceDateTime(values) || '',
      siteId: values.siteId || '',
      location: values.location || '',
      severity: values.severity || '',
      incidentCategory: values.incidentCategory || '',
    }
    const validated = incidentSubmissionSchema.safeParse(candidate)
    if (!validated.success) {
      setSubmitError(validated.error.issues[0]?.message || 'Please complete the required fields before submitting.')
      return
    }
    if (!draftId) {
      setSubmitError('Save the draft before submitting the report.')
      return
    }
    try {
      const submitted = await submitIncident.mutateAsync({ incidentId: draftId, input: validated.data })
      setSubmitMessage(`Report ${submitted.referenceNumber} submitted successfully.`)
      window.location.hash = `#incident-detail?id=${submitted.id}`
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to submit the incident report.')
    }
  }, () => {
    setSubmitError('Please correct the highlighted fields before submitting.')
    setSubmitMessage('')
  })

  const stageFields: Array<Array<keyof IncidentFormValues>> = [
    ['title', 'incidentCategory', 'severity', 'occurrenceDate', 'occurrenceTime', 'description'],
    ['siteId', 'location'],
    ['immediateCorrection'],
    ['digitalSignature', 'accuracyConfirmed'],
  ]

  const continueStage = async () => {
    const valid = await form.trigger(stageFields[activeStage])
    if (valid) setActiveStage((stage) => Math.min(stage + 1, stages.length - 1))
  }

  const handleEvidence = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!draftId) {
      setSubmitError('Save the draft before adding evidence.')
      return
    }
    try {
      await uploadEvidence.mutateAsync({ incidentId: draftId, file })
      setSubmitMessage('Evidence uploaded securely.')
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to upload evidence.')
    }
  }

  return (
    <div className="incident-form-page">
      <div className="incident-form-header">
        <div>
          <h2>Report an incident</h2>
          <p>Progressive form — drafts are auto-saved and can be submitted offline; they sync when connectivity returns.</p>
        </div>
        <button className="button button-outline incident-save-button" type="button" disabled={isBusy} onClick={() => void saveDraft()}>Save draft</button>
      </div>
      <div className="incident-stage-progress"><div className="incident-stage-bar"><span style={{ width: `${((activeStage + 1) / stages.length) * 100}%` }} /></div><div className="incident-stage-labels">{stages.map((stage, index) => <button type="button" className={index === activeStage ? 'active' : index < activeStage ? 'complete' : ''} key={stage} onClick={() => index <= activeStage && setActiveStage(index)}>{index + 1}. {stage}</button>)}</div></div>
      <div className="incident-wizard-layout">
        <form className="incident-form" onSubmit={submitReport}>
        {activeStage === 0 && <section className="incident-form-section">
          <div className="incident-form-section-heading"><div><h3>What happened?</h3><p>Required fields are validated before you can continue.</p></div></div>
          <div className="incident-form-grid">
            <label className="incident-form-wide">Incident title *<input {...form.register('title')} placeholder="Short factual description" />{fieldError(form.formState.errors.title?.message)}</label>
            <label>Incident category *<select {...form.register('incidentCategory')}><option value="">Select incident category</option>{categories.map((category) => <option value={category} key={category}>{category}</option>)}</select>{fieldError(form.formState.errors.incidentCategory?.message)}</label>
            <label>Severity *<select {...form.register('severity')}><option value="">Select severity</option>{severities.map((severity) => <option value={severity} key={severity}>{severity}</option>)}</select>{fieldError(form.formState.errors.severity?.message)}</label>
            <label>Priority<select {...form.register('priority')}><option value="">Select priority</option><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label>
            <label>Date *<input type="date" {...form.register('occurrenceDate')} />{fieldError(form.formState.errors.occurrenceDate?.message)}</label>
            <label>Time *<input type="time" {...form.register('occurrenceTime')} />{fieldError(form.formState.errors.occurrenceTime?.message)}</label>
            <label className="incident-form-wide">Description *<textarea {...form.register('description')} rows={5} placeholder="Describe the sequence of events factually." />{fieldError(form.formState.errors.description?.message)}</label>
          </div>
        </section>}
        {activeStage === 1 && <section className="incident-form-section">
          <div className="incident-form-section-heading"><div><h3>Where and under what conditions?</h3></div></div>
          <div className="incident-form-grid">
            <label>Site *<select {...form.register('siteId')}><option value="">{configuredSites.length ? 'Select site' : 'No sites configured'}</option>{configuredSites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select>{fieldError(form.formState.errors.siteId?.message)}</label>
            <label>Facility / area<select {...form.register('facilityId')} disabled={!selectedSite}><option value="">Select facility</option>{availableFacilities.map((facility) => <option value={facility.id} key={facility.id}>{facility.name}</option>)}</select></label>
            <label>Department<select {...form.register('department')}><option value="">Select department</option>{departments.map((department) => <option value={department} key={department}>{department}</option>)}</select></label>
            <label>GPS coordinates<input {...form.register('gpsCoordinates')} placeholder="4.8156, 7.0498" /></label>
            <label>Facility / area<input {...form.register('location')} placeholder="Area, unit, or precise location" />{fieldError(form.formState.errors.location?.message)}</label>
            <label>Weather conditions<input {...form.register('weatherConditions')} placeholder="32°C, light rain, wind 12 kt" /></label>
            <label className="incident-form-wide">Equipment involved<input {...form.register('equipmentInvolved')} placeholder="Equipment or vehicle involved" /></label>
          </div>
        </section>}
        {activeStage === 2 && <section className="incident-form-section">
          <div className="incident-form-section-heading"><div><h3>Who was involved?</h3></div></div>
          <div className="incident-form-grid">
            <label>Reporter name *<input value={organization.data?.userId || 'Authenticated user'} disabled /></label>
            <label>Contractor involved<input {...form.register('contractorOrganization')} placeholder="Contractor organization" />{fieldError(form.formState.errors.contractorOrganization?.message)}</label>
            <label className="incident-form-wide">People involved<textarea {...form.register('peopleInvolved')} rows={3} placeholder="Names, roles and injuries sustained" /></label>
            <label className="incident-form-wide">Witnesses<textarea {...form.register('witnesses')} rows={3} placeholder="Witness names and contact details" /></label>
            <label className="incident-form-wide">Immediate actions taken *<textarea {...form.register('immediateCorrection')} rows={4} placeholder="Describe immediate controls, first aid, isolation, notification, or other response." />{fieldError(form.formState.errors.immediateCorrection?.message)}</label>
            <label className="incident-form-wide">Potential root cause<textarea {...form.register('potentialRootCause')} rows={3} placeholder="Initial indication only; formal root-cause analysis follows later." /></label>
          </div>
        </section>}
        {activeStage === 3 && <section className="incident-form-section"><div className="incident-form-section-heading"><div><h3>Evidence and sign-off</h3><p>Images, PDF, Word, Excel, video and voice notes are supported.</p></div></div><div className="incident-evidence-upload-grid"><label className="incident-upload-tile">Photos / video<input type="file" hidden accept="image/*,video/*" onChange={handleEvidence} /></label><label className="incident-upload-tile">Documents<input type="file" hidden accept="application/pdf,.doc,.docx,.xls,.xlsx" onChange={handleEvidence} /></label><label className="incident-upload-tile">Voice recording<input type="file" hidden accept="audio/*" onChange={handleEvidence} /></label></div><label className="incident-form-wide">Digital signature *<input {...form.register('digitalSignature')} placeholder="Type your full name to sign" />{fieldError(form.formState.errors.digitalSignature?.message)}</label><label className="checkbox-field"><input type="checkbox" {...form.register('accuracyConfirmed')} /> I confirm this report is accurate to the best of my knowledge.</label></section>}
        {draftReference && <div className="incident-reference" role="status"><span>Draft reference</span><strong>{draftReference}</strong></div>}
        {submitError && <div className="auth-message error" role="alert">{submitError}</div>}
        {submitMessage && <div className="auth-message success" role="status">{submitMessage}</div>}
        <div className="incident-form-actions">
          <button
            className="button button-outline button-large"
            type="button"
            disabled={isBusy}
            onClick={() => {
              if (activeStage > 0) {
                setActiveStage((stage) => stage - 1)
              } else {
                onBack()
              }
            }}
          >
            Back
          </button>
          {activeStage < stages.length - 1 ? <button className="button button-green button-large" type="button" disabled={isBusy} onClick={() => void continueStage()}>Continue</button> : <button className="button button-green button-large" type="button" disabled={isBusy} onClick={() => void submitReport()}>{isSubmitting ? 'Submitting incident...' : 'Submit incident'}</button>}
        </div>
        </form>
        <aside className="incident-form-sidebar">
          <section className="incident-side-panel">
            <h3>Field mode</h3>
            <p>Large touch targets for gloved hands, one-handed layout and automatic GPS capture are enabled.</p>
            <p>Offline reports queue on the device and sync automatically when connectivity is restored.</p>
            <button type="button" className={`field-mode-toggle${fieldMode ? ' active' : ''}`} onClick={() => setFieldMode((enabled) => !enabled)}>Voice-to-text report</button>
          </section>
        </aside>
      </div>
    </div>
  )
}
