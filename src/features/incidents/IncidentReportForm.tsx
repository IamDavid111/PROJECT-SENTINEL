import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  Alert,
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  buttonVariants,
} from '../../components/ui'
import { ReportStageEvent } from './ReportStageEvent'
import { ReportStageLocation } from './ReportStageLocation'
import { ReportStagePeople } from './ReportStagePeople'
import { ReportStageEvidence } from './ReportStageEvidence'
import { ReportStepChips, ReportStepRail } from './ReportWizardSteps'
import { ReportWizardFooter } from './ReportWizardFooter'
import { SubmitIncidentDialogs } from './SubmitIncidentDialogs'
import { incidentFormSchema, incidentSubmissionSchema, type IncidentFormValues } from './incidentSchemas'
import { enqueueIncidentSubmission } from './incidentOfflineQueue'
import { useCreateIncidentDraft, useIncident, useIncidentOrganization, useSubmitIncident, useSubmitNewIncident, useUpdateIncidentDraft, useUploadIncidentEvidence } from './useIncidentData'
import type { IncidentDetail, IncidentDraftInput, IncidentReportType, IncidentSubmissionInput } from './incidentTypes'

const stages = ['Event', 'Location & context', 'People', 'Evidence & sign-off'] as const

type SiteOption = { id: string; name: string }
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

function configuredSiteNames(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const rawName = typeof item === 'string' ? item : item && typeof item === 'object' && typeof (item as Record<string, unknown>).name === 'string' ? (item as Record<string, unknown>).name as string : ''
    if (!rawName || (typeof item === 'object' && item !== null && 'active' in item && (item as Record<string, unknown>).active === false)) return []
    return rawName.trim() ? [rawName.trim()] : []
  })
}

function configuredShiftNames(value: unknown, legacyValue = '') {
  if (!value || typeof value !== 'object') return []
  const shifts = (value as Record<string, unknown>).shifts
  if (!Array.isArray(shifts)) return []
  const names = shifts.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return []
    const shift = item as Record<string, unknown>
    return typeof shift.name === 'string' && shift.name.trim() && shift.active !== false ? [shift.name.trim()] : []
  })
  if (legacyValue && !names.some((name) => name.toLowerCase() === legacyValue.toLowerCase())) names.push(legacyValue)
  return names
}

// The browser collects date and time separately; the database field stores one timezone-aware timestamp.
function combineOccurrenceDateTime(values: IncidentFormValues) {
  if (!values.occurrenceDate || !values.occurrenceTime) return undefined
  const date = new Date(`${values.occurrenceDate}T${values.occurrenceTime}`)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function formatLocalDate(date: Date | null) {
  if (!date || Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// Save only incident-domain values plus the current wizard stage, leaving browser-only date/time fields out of the payload.
function toDraftInput(values: IncidentFormValues, draftStage: number): IncidentDraftInput {
  const contractorOrganization = values.contractorOrganization?.trim() || undefined
  return {
    reportType: values.reportType,
    draftStage,
    title: values.title,
    description: values.description,
    occurredAt: combineOccurrenceDateTime(values),
    siteId: values.siteId,
    facilityId: values.facilityId,
    location: values.location,
    department: values.department,
    shift: values.shift,
    workActivityContext: values.workActivityContext,
    severity: values.severity,
    potentialSeverity: values.potentialSeverity,
    incidentCategory: values.incidentCategory,
    contractorInvolved: Boolean(contractorOrganization),
    contractorOrganization,
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

const submissionFieldForPath: Record<string, keyof IncidentFormValues> = {
  title: 'title',
  description: 'description',
  siteId: 'siteId',
  severity: 'severity',
  potentialSeverity: 'potentialSeverity',
  incidentCategory: 'incidentCategory',
  immediateCorrection: 'immediateCorrection',
  accuracyConfirmed: 'accuracyConfirmed',
  environmentalImpact: 'environmentalImpact',
}

const submissionStageByField: Partial<Record<keyof IncidentFormValues, number>> = {
  title: 0,
  incidentCategory: 0,
  severity: 0,
  potentialSeverity: 0,
  occurrenceDate: 0,
  occurrenceTime: 0,
  description: 0,
  environmentalImpact: 0,
  siteId: 1,
  immediateCorrection: 2,
  accuracyConfirmed: 3,
}

// One editor handles both new reports and drafts reopened from My Reports.
// It keeps the staged form data together while the user saves a draft, adds evidence, or submits the report.
export function IncidentReportForm({ supabase, reportType, initialTitle, initialCategory, initialEnvironmentalImpact, draftId: existingDraftId, initialIncident }: { supabase: SupabaseClient; reportType: IncidentReportType; initialTitle?: string; initialCategory?: string; initialEnvironmentalImpact?: boolean; draftId?: string; initialIncident?: IncidentDetail }) {
  const organization = useIncidentOrganization(supabase)
  const [draftId, setDraftId] = useState<string | null>(existingDraftId || null)
  const existingDraft = useIncident(supabase, draftId || null)
  const loadedIncident = existingDraft.data || initialIncident
  const [sites, setSites] = useState<SiteOption[]>([])
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [settingsError, setSettingsError] = useState('')
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [draftReference, setDraftReference] = useState(existingDraftId ? (initialIncident?.referenceNumber || '') : '')
  const [draftType, setDraftType] = useState<'manual' | 'offline-pending' | null>(existingDraftId ? 'manual' : null)
  const [activeStage, setActiveStage] = useState(0)
  const [submitConfirmationOpen, setSubmitConfirmationOpen] = useState(false)
  const [submissionSuccessOpen, setSubmissionSuccessOpen] = useState(false)
  const autoConfirmDraftSubmission = useRef(new URLSearchParams(window.location.hash.split('?')[1] || '').get('submit') === '1')
  const hydratedDraftId = useRef<string | null>(null)
  const createDraft = useCreateIncidentDraft(supabase)
  const updateDraft = useUpdateIncidentDraft(supabase)
  const submitIncident = useSubmitIncident(supabase)
  const submitNewIncident = useSubmitNewIncident(supabase)
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
  const [reporterName, setReporterName] = useState('Authenticated user')
  const currentReportType = loadedIncident?.reportType || reportType

  useEffect(() => {
    if (!organization.data?.userId) {
      setReporterName('Authenticated user')
      return
    }

    let active = true
    void supabase
      .from('profiles')
      .select('full_name')
      .eq('id', organization.data.userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        const nextName = typeof data?.full_name === 'string' && data.full_name.trim() ? data.full_name.trim() : 'Authenticated user'
        setReporterName(error ? 'Authenticated user' : nextName)
      })

    return () => {
      active = false
    }
  }, [organization.data?.userId, supabase])

  useEffect(() => {
    if (!loadedIncident || hydratedDraftId.current === loadedIncident.id) return
    hydratedDraftId.current = loadedIncident.id
    setDraftId(loadedIncident.id)
    setDraftReference(loadedIncident.referenceNumber)
    setDraftType('manual')
    const occurred = loadedIncident.occurredAt ? new Date(loadedIncident.occurredAt) : null
    form.reset({
      reportType: loadedIncident.reportType,
      title: loadedIncident.title === 'Untitled draft' ? '' : loadedIncident.title,
      description: loadedIncident.description || '',
      occurrenceDate: formatLocalDate(occurred),
      occurrenceTime: occurred && !Number.isNaN(occurred.getTime()) ? occurred.toTimeString().slice(0, 5) : '',
      siteId: loadedIncident.siteId || undefined,
      facilityId: loadedIncident.facilityId || undefined,
      location: loadedIncident.location || '',
      department: loadedIncident.department || '',
      shift: loadedIncident.shift || '',
      workActivityContext: loadedIncident.workActivityContext || '',
      severity: loadedIncident.severity || '',
      potentialSeverity: loadedIncident.potentialSeverity || '',
      incidentCategory: loadedIncident.incidentCategory || '',
      contractorInvolved: loadedIncident.contractorInvolved,
      contractorOrganization: loadedIncident.contractorOrganization || '',
      environmentalImpact: loadedIncident.environmentalImpact,
      injuryOrIllness: loadedIncident.injuryOrIllness,
      propertyDamage: loadedIncident.propertyDamage,
      workRelated: loadedIncident.workRelated,
      immediateCorrection: loadedIncident.immediateCorrection || '',
      priority: loadedIncident.priority || '',
      gpsCoordinates: loadedIncident.gpsCoordinates || '',
      weatherConditions: loadedIncident.weatherConditions || '',
      equipmentInvolved: loadedIncident.equipmentInvolved || '',
      peopleInvolved: loadedIncident.peopleInvolved || '',
      witnesses: loadedIncident.witnesses || '',
      potentialRootCause: loadedIncident.potentialRootCause || '',
      digitalSignature: loadedIncident.digitalSignature || '',
      accuracyConfirmed: loadedIncident.accuracyConfirmed,
    })
    setActiveStage(Math.max(0, Math.min(loadedIncident.draftStage || 0, stages.length - 1)))
  }, [form, loadedIncident])

  useEffect(() => {
    if (!autoConfirmDraftSubmission.current || !loadedIncident) return
    autoConfirmDraftSubmission.current = false
    setSubmitConfirmationOpen(true)
  }, [loadedIncident])

  useEffect(() => {
    if (!organization.data?.organizationId) return
    let active = true
    void Promise.all([
      supabase.from('sites').select('id, name').eq('organization_id', organization.data.organizationId).order('name'),
      supabase.from('company_settings').select('departments, operational_sites, incident_categories, severity_levels, working_hours').eq('organization_id', organization.data.organizationId).maybeSingle(),
    ]).then(([siteResult, settingsResult]) => {
      if (!active) return
      if (siteResult.error || settingsResult.error) {
        setSettingsError('Unable to load company configuration. Please try again before reporting an incident.')
        setSites([])
        setSettings({})
      } else {
        setSites(siteResult.data || [])
        setSettings(settingsResult.data || {})
      }
      setSettingsLoading(false)
    })
    return () => { active = false }
  }, [organization.data?.organizationId, supabase])

  if (existingDraftId && existingDraft.isLoading) {
    return (
      <div className="grid gap-5">
        <PageHeader eyebrow="Report incident" title="Report an incident" description="Restoring the draft." />
        <Skeleton className="h-[320px] rounded-card" />
      </div>
    )
  }
  if (existingDraftId && (existingDraft.isError || !loadedIncident || loadedIncident.status !== 'draft')) {
    return (
      <EmptyState
        icon="incidents"
        title="Draft unavailable"
        description="This draft could not be loaded or is no longer editable."
        action={<a href="#my-reports" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Return to My Reports</a>}
      />
    )
  }
  if (settingsLoading) {
    return (
      <div className="grid gap-5">
        <PageHeader eyebrow="Report incident" title="Report an incident" description="Loading company configuration." />
        <Skeleton className="h-[320px] rounded-card" />
      </div>
    )
  }
  if (settingsError) {
    return (
      <EmptyState
        icon="settings"
        title="Configuration unavailable"
        description={settingsError}
        action={<a href="#dashboard" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Return to dashboard</a>}
      />
    )
  }

  const configuredSites = sites.filter((site) => configuredSiteNames(settings.operational_sites).some((name) => name.toLowerCase() === site.name.toLowerCase()) || site.id === loadedIncident?.siteId)
  const departments = configuredOptions(settings.departments, [], loadedIncident?.department || '')
  const shifts = configuredShiftNames(settings.working_hours, loadedIncident?.shift || '')
  const categories = configuredOptions(settings.incident_categories, [], loadedIncident?.incidentCategory || '')
  const severities = configuredOptions(settings.severity_levels, [], loadedIncident?.severity || '')

  const isSaving = createDraft.isPending || updateDraft.isPending
  const isSubmitting = submitIncident.isPending || submitNewIncident.isPending
  const isBusy = isSaving || isSubmitting

  // A new form creates a manual draft; reopening one updates that same draft and preserves its reference for later edits.
  const saveDraft = async () => {
    setSubmitError('')
    setSubmitMessage('')
    try {
      const input = toDraftInput(form.getValues(), activeStage)
      const saved = draftId ? await updateDraft.mutateAsync({ incidentId: draftId, input }) : await createDraft.mutateAsync(input)
      hydratedDraftId.current = saved.id
      setDraftId(saved.id)
      setDraftReference(saved.referenceNumber)
      setDraftType('manual')
      setSubmitMessage(`Draft ${saved.referenceNumber} saved as a manual draft. You can continue it later.`)
      window.setTimeout(() => { window.location.hash = '#my-reports' }, 1500)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to save the draft.')
    }
  }

  const submitReport = form.handleSubmit(async (values) => {
    setSubmitError('')
    setSubmitMessage('')
    const candidate: IncidentSubmissionInput = {
      ...toDraftInput(values, activeStage),
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
      form.clearErrors()
      const invalidStages: number[] = []
      for (const issue of validated.error.issues) {
        const path = issue.path[0]
        const field = path === 'occurredAt'
          ? (values.occurrenceDate ? 'occurrenceTime' : 'occurrenceDate')
          : typeof path === 'string' ? submissionFieldForPath[path] : undefined
        if (!field) continue
        form.setError(field, { type: 'validate', message: issue.message })
        const stage = submissionStageByField[field]
        if (stage !== undefined) invalidStages.push(stage)
      }
      if (invalidStages.length) setActiveStage(Math.min(...invalidStages))
      setSubmitError(validated.error.issues[0]?.message || 'Please complete the required fields before submitting.')
      return
    }

    // Unsaved reports can queue for later sync, but a manual server draft is submitted only while online.
    if (!navigator.onLine) {
      if (draftId && draftType === 'manual') {
        setSubmitError('Manual drafts can only be submitted while online. Your draft remains unchanged.')
        return
      }
      try {
        const queued = await enqueueIncidentSubmission(validated.data)
        setDraftType('offline-pending')
        setDraftReference(`OFFLINE-${queued.id.slice(0, 8).toUpperCase()}`)
        setSubmitMessage('Report queued for automatic submission when connectivity returns. Your data remains on this device.')
      } catch (error) {
        setSubmitError(error instanceof Error ? error.message : 'Unable to queue the incident for offline submission.')
      }
      return
    }

    try {
      let activeDraftId = draftId
      if (!activeDraftId) {
        const submitted = await submitNewIncident.mutateAsync(validated.data)
        setSubmitMessage(`Report ${submitted.referenceNumber} submitted successfully.`)
        setSubmissionSuccessOpen(true)
        return
      }

      const submitted = await submitIncident.mutateAsync({ incidentId: activeDraftId, input: validated.data })
      setSubmitMessage(`Report ${submitted.referenceNumber} submitted successfully.`)
      setSubmissionSuccessOpen(true)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to submit the incident report.')
    }
  }, (errors) => {
    const invalidFields = Object.keys(errors).filter((field): field is keyof IncidentFormValues => field in submissionStageByField)
    const invalidStages = invalidFields.flatMap((field) => {
      const stage = submissionStageByField[field]
      return stage === undefined ? [] : [stage]
    })
    if (invalidStages.length) setActiveStage(Math.min(...invalidStages))
    const firstError = Object.values(errors).find((error) => typeof error?.message === 'string')
    setSubmitError(typeof firstError?.message === 'string' ? firstError.message : 'Please correct the highlighted fields before submitting.')
    setSubmitMessage('')
  })

  const stageFields: Array<Array<keyof IncidentFormValues>> = [
    ['title', 'incidentCategory', 'severity', 'occurrenceDate', 'occurrenceTime', 'description'],
    ['siteId'],
    ['immediateCorrection'],
    ['accuracyConfirmed'],
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

  const requestSubmitConfirmation = () => {
    if (!isBusy) setSubmitConfirmationOpen(true)
  }



  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Report incident"
        title="Report an incident"
        description="Progressive form — drafts are auto-saved and can be submitted offline; they sync when connectivity returns."
        actions={
          <>
            <Badge tone={draftType === 'offline-pending' ? 'warning' : 'neutral'}>
              {draftType === 'offline-pending' ? 'Offline pending' : draftReference ? `Draft ${draftReference}` : 'New report'}
            </Badge>
            <a href="#my-reports" className={buttonVariants({ variant: 'outline', size: 'sm' })}>My reports</a>
          </>
        }
      />

      <form
        className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]"
        onSubmit={(event) => { event.preventDefault(); requestSubmitConfirmation() }}
      >
        <ReportStepRail stages={stages} activeStage={activeStage} onSelect={setActiveStage} />

        <div className="grid min-w-0 gap-5">
          <ReportStepChips stages={stages} activeStage={activeStage} onSelect={setActiveStage} />

          <Card className="p-5 shadow-none">
            {activeStage === 0 && (
              <ReportStageEvent form={form} categories={categories} severities={severities} currentReportType={currentReportType} />
            )}
            {activeStage === 1 && (
              <ReportStageLocation form={form} configuredSites={configuredSites} departments={departments} />
            )}
            {activeStage === 2 && (
              <ReportStagePeople form={form} reporterName={reporterName} shifts={shifts} />
            )}
            {activeStage === 3 && (
              <ReportStageEvidence form={form} loadedIncident={loadedIncident} isBusy={isBusy} onEvidence={handleEvidence} />
            )}
          </Card>

          {submitError && <Alert tone="danger">{submitError}</Alert>}
          {submitMessage && <Alert tone="success">{submitMessage}</Alert>}

          <ReportWizardFooter
            activeStage={activeStage}
            stageCount={stages.length}
            isBusy={isBusy}
            isSaving={isSaving}
            isSubmitting={isSubmitting}
            draftReference={draftReference}
            draftType={draftType}
            onBack={() => setActiveStage(activeStage - 1)}
            onSaveDraft={() => void saveDraft()}
            onContinue={() => void continueStage()}
          />
        </div>
      </form>

      <SubmitIncidentDialogs
        confirmationOpen={submitConfirmationOpen}
        successOpen={submissionSuccessOpen}
        isSubmitting={isSubmitting}
        draftReference={draftReference}
        submitMessage={submitMessage}
        onCloseConfirmation={() => setSubmitConfirmationOpen(false)}
        onCloseSuccess={() => setSubmissionSuccessOpen(false)}
        onSubmit={() => { setSubmitConfirmationOpen(false); void submitReport() }}
        onViewIncidents={() => { setSubmissionSuccessOpen(false); window.location.hash = '#incidents' }}
      />
    </div>
  )
}