import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { SupabaseClient } from '@supabase/supabase-js'

import { incidentFormSchema, incidentSubmissionSchema, type IncidentFormValues } from './incidentSchemas'
import { useCreateIncidentDraft, useIncidentOrganization, useSubmitIncident, useUpdateIncidentDraft } from './useIncidentData'
import type { IncidentDetail, IncidentDraftInput, IncidentReportType, IncidentSubmissionInput } from './incidentTypes'

const fallbackSeverities = ['low', 'medium', 'high', 'critical']

type SiteOption = { id: string; name: string }
type FacilityOption = { id: string; name: string; site_id: string }

function configuredOptions(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback
  const options = value.flatMap((item) => {
    if (typeof item === 'string') return [item]
    if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string') return [item.name]
    return []
  })
  return options.length ? options : fallback
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
  }
}

export function IncidentReportForm({ supabase, reportType, draftId: existingDraftId, initialIncident, onBack }: { supabase: SupabaseClient; reportType: IncidentReportType; draftId?: string; initialIncident?: IncidentDetail; onBack: () => void }) {
  const organization = useIncidentOrganization(supabase)
  const [sites, setSites] = useState<SiteOption[]>([])
  const [facilities, setFacilities] = useState<FacilityOption[]>([])
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [draftId, setDraftId] = useState<string | null>(existingDraftId || null)
  const [draftReference, setDraftReference] = useState(existingDraftId ? (initialIncident?.referenceNumber || '') : '')
  const createDraft = useCreateIncidentDraft(supabase)
  const updateDraft = useUpdateIncidentDraft(supabase)
  const submitIncident = useSubmitIncident(supabase)
  const form = useForm<IncidentFormValues>({
    resolver: zodResolver(incidentFormSchema),
    defaultValues: {
      reportType,
      contractorInvolved: false,
      environmentalImpact: reportType === 'environmental_incident',
      injuryOrIllness: false,
      propertyDamage: false,
      workRelated: true,
      affectedPersonName: '',
      affectedPersonOrganization: '',
      witnessName: '',
      witnessOrganization: '',
      witnessContactDetails: '',
    },
  })
  const contractorInvolved = form.watch('contractorInvolved')
  const selectedSite = form.watch('siteId')
  const incidentType = form.watch('reportType')

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
    })
  }, [form, initialIncident])

  useEffect(() => {
    if (!organization.data?.organizationId) return
    let active = true
    void Promise.all([
      supabase.from('sites').select('id, name').eq('organization_id', organization.data.organizationId).order('name'),
      supabase.from('facilities').select('id, name, site_id').eq('organization_id', organization.data.organizationId).order('name'),
      supabase.from('company_settings').select('departments, incident_categories, severity_levels').eq('organization_id', organization.data.organizationId).maybeSingle(),
    ]).then(([siteResult, facilityResult, settingsResult]) => {
      if (!active) return
      setSites(siteResult.data || [])
      setFacilities(facilityResult.data || [])
      setSettings(settingsResult.data || {})
    })
    return () => { active = false }
  }, [organization.data?.organizationId, supabase])

  const availableFacilities = facilities.filter((facility) => facility.site_id === selectedSite)
  const departments = configuredOptions(settings.departments, [])
  const categories = configuredOptions(settings.incident_categories, [])
  const severities = configuredOptions(settings.severity_levels, fallbackSeverities)

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

  return (
    <div className="incident-form-page">
      <div className="incident-form-header">
        <div>
          <div className="eyebrow">REPORT INCIDENT</div>
          <h2>{incidentType.replaceAll('_', ' ')}</h2>
          <p>Capture the event carefully. Immediate correction is recorded separately from future corrective action.</p>
        </div>
        <button className="button button-outline incident-back-button" type="button" onClick={onBack}>Change report type</button>
      </div>

      <form className="incident-form" onSubmit={submitReport}>
        <section className="incident-form-section">
          <div className="incident-form-section-heading"><span>01</span><div><h3>Event information</h3><p>Describe when and where the event occurred.</p></div></div>
          <div className="incident-form-grid">
            <label>Title<input {...form.register('title')} placeholder="Short, specific event title" />{fieldError(form.formState.errors.title?.message)}</label>
            <label>Occurrence date<input type="date" {...form.register('occurrenceDate')} />{fieldError(form.formState.errors.occurrenceDate?.message)}</label>
            <label>Occurrence time<input type="time" {...form.register('occurrenceTime')} />{fieldError(form.formState.errors.occurrenceTime?.message)}</label>
            <label>Site<select {...form.register('siteId')}><option value="">Select site</option>{sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select>{fieldError(form.formState.errors.siteId?.message)}</label>
            <label>Facility<select {...form.register('facilityId')} disabled={!selectedSite}><option value="">Select facility</option>{availableFacilities.map((facility) => <option value={facility.id} key={facility.id}>{facility.name}</option>)}</select></label>
            <label>Location<input {...form.register('location')} placeholder="Area, unit, or precise location" />{fieldError(form.formState.errors.location?.message)}</label>
            <label>Department<select {...form.register('department')}><option value="">Select department</option>{departments.map((department) => <option value={department} key={department}>{department}</option>)}</select></label>
            <label className="incident-form-wide">Work/activity context<textarea {...form.register('workActivityContext')} rows={3} placeholder="What work or activity was taking place?" /></label>
            <label className="incident-form-wide">Description<textarea {...form.register('description')} rows={5} placeholder="Describe what happened, what was observed, and the immediate circumstances." />{fieldError(form.formState.errors.description?.message)}</label>
          </div>
        </section>

        <section className="incident-form-section">
          <div className="incident-form-section-heading"><span>02</span><div><h3>People and involvement</h3><p>Use existing profiles where available; capture external people only when necessary.</p></div></div>
          <div className="incident-form-grid">
            <label>Reporter<input value={organization.data?.userId || 'Authenticated user'} disabled /></label>
            <label>Affected person name<input {...form.register('affectedPersonName')} placeholder="Optional" /></label>
            <label>Affected person organization<input {...form.register('affectedPersonOrganization')} placeholder="Optional" /></label>
            <label className="checkbox-field"><input type="checkbox" {...form.register('contractorInvolved')} /> Contractor involved</label>
            {contractorInvolved && <label>Contractor organization<input {...form.register('contractorOrganization')} placeholder="Contractor company" />{fieldError(form.formState.errors.contractorOrganization?.message)}</label>}
            <label>Witness name<input {...form.register('witnessName')} placeholder="Optional witness" /></label>
            <label>Witness organization<input {...form.register('witnessOrganization')} placeholder="Optional" /></label>
            <label>Witness contact details<input {...form.register('witnessContactDetails')} placeholder="Optional" /></label>
          </div>
        </section>

        <section className="incident-form-section">
          <div className="incident-form-section-heading"><span>03</span><div><h3>Classification</h3><p>Classify actual and potential consequences independently.</p></div></div>
          <div className="incident-form-grid">
            <label>Incident type<select {...form.register('reportType')}><option value="incident">Incident</option><option value="near_miss">Near Miss</option><option value="unsafe_act">Unsafe Act</option><option value="unsafe_condition">Unsafe Condition</option><option value="environmental_incident">Environmental Incident</option></select></label>
            <label>Category<select {...form.register('incidentCategory')}><option value="">Select category</option>{categories.map((category) => <option value={category} key={category}>{category}</option>)}</select>{fieldError(form.formState.errors.incidentCategory?.message)}</label>
            <label>Actual severity<select {...form.register('severity')}><option value="">Select severity</option>{severities.map((severity) => <option value={severity} key={severity}>{severity}</option>)}</select>{fieldError(form.formState.errors.severity?.message)}</label>
            <label>Potential severity<select {...form.register('potentialSeverity')}><option value="">Select potential severity</option>{severities.map((severity) => <option value={severity} key={severity}>{severity}</option>)}</select>{fieldError(form.formState.errors.potentialSeverity?.message)}</label>
            <label className="checkbox-field"><input type="checkbox" {...form.register('environmentalImpact')} /> Environmental relevance</label>
            <label className="checkbox-field"><input type="checkbox" {...form.register('injuryOrIllness')} /> Injury or illness involved</label>
            <label className="checkbox-field"><input type="checkbox" {...form.register('propertyDamage')} /> Property damage involved</label>
            <label className="checkbox-field"><input type="checkbox" {...form.register('workRelated')} /> Work-related event</label>
          </div>
        </section>

        <section className="incident-form-section">
          <div className="incident-form-section-heading"><span>04</span><div><h3>Immediate response</h3><p>Record what was done immediately to control or remove the immediate problem.</p></div></div>
          <label className="incident-form-wide">Immediate correction / action<textarea {...form.register('immediateCorrection')} rows={5} placeholder="Describe immediate controls, first aid, isolation, notification, or other response." /></label>
          <p className="incident-form-note">Corrective actions that address underlying causes will be handled in the future Corrective Action module.</p>
        </section>

        {draftReference && <div className="incident-reference" role="status"><span>Draft reference</span><strong>{draftReference}</strong></div>}
        {submitError && <div className="auth-message error" role="alert">{submitError}</div>}
        {submitMessage && <div className="auth-message success" role="status">{submitMessage}</div>}
        <div className="incident-form-actions"><button className="button button-outline button-large" type="button" disabled={isBusy} onClick={() => void saveDraft()}>{isSaving ? 'Saving draft...' : draftId ? 'Update draft' : 'Save draft'}</button><button className="button button-green button-large" type="button" disabled={isBusy} onClick={() => void submitReport()}>{isSubmitting ? 'Submitting report...' : 'Submit report →'}</button><button className="button button-outline button-large" type="button" disabled={isBusy} onClick={onBack}>Back</button></div>
      </form>
    </div>
  )
}
