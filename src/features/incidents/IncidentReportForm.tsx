import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { SupabaseClient } from '@supabase/supabase-js'

import { incidentFormSchema, incidentSubmissionSchema, type IncidentFormValues } from './incidentSchemas'
import { enqueueIncidentSubmission } from './incidentOfflineQueue'
import { useCreateIncidentDraft, useIncidentOrganization, useSubmitIncident, useSubmitNewIncident, useUpdateIncidentDraft, useUploadIncidentEvidence } from './useIncidentData'
import type { IncidentDetail, IncidentDraftInput, IncidentReportType, IncidentSubmissionInput } from './incidentTypes'

const stages = ['Event', 'Location & context', 'People', 'Evidence & sign-off'] as const

type SiteOption = { id: string; name: string }
type FieldModeStatus = 'idle' | 'requesting' | 'recording' | 'paused' | 'saving' | 'signoff' | 'error'
type RecordedAudio = { file: File; url: string }

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
  if (!Array.isArray(value)) return legacyValue ? [normalizeIncidentCategoryName(legacyValue)] : []
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

export function IncidentReportForm({ supabase, reportType, initialTitle, initialCategory, initialEnvironmentalImpact, draftId: existingDraftId, initialIncident, startInFieldMode = false, onBack }: { supabase: SupabaseClient; reportType: IncidentReportType; initialTitle?: string; initialCategory?: string; initialEnvironmentalImpact?: boolean; draftId?: string; initialIncident?: IncidentDetail; startInFieldMode?: boolean; onBack: () => void }) {
  const organization = useIncidentOrganization(supabase)
  const [sites, setSites] = useState<SiteOption[]>([])
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [draftId, setDraftId] = useState<string | null>(existingDraftId || null)
  const [draftReference, setDraftReference] = useState(existingDraftId ? (initialIncident?.referenceNumber || '') : '')
  const [draftType, setDraftType] = useState<'manual' | 'offline-pending' | null>(existingDraftId ? 'manual' : null)
  const [activeStage, setActiveStage] = useState(0)
  const [fieldMode, setFieldMode] = useState(startInFieldMode)
  const [fieldModeStatus, setFieldModeStatus] = useState<FieldModeStatus>('idle')
  const [fieldModeMuted, setFieldModeMuted] = useState(false)
  const [recordedAudio, setRecordedAudio] = useState<RecordedAudio | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
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
  const selectedSeverity = form.watch('severity')
  const selectedCategory = form.watch('incidentCategory')
  const [reporterName, setReporterName] = useState('Authenticated user')

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
    return () => {
      mediaRecorderRef.current?.stop()
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
      if (recordedAudio?.url) URL.revokeObjectURL(recordedAudio.url)
    }
  }, [recordedAudio?.url])

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
      supabase.from('company_settings').select('departments, operational_sites, incident_categories, severity_levels').eq('organization_id', organization.data.organizationId).maybeSingle(),
    ]).then(([siteResult, settingsResult]) => {
      if (!active) return
      setSites(siteResult.data || [])
      setSettings(settingsResult.data || {})
    })
    return () => { active = false }
  }, [organization.data?.organizationId, supabase])

  const configuredSites = settings.operational_sites === undefined ? sites : sites.filter((site) => configuredSiteNames(settings.operational_sites).some((name) => name.toLowerCase() === site.name.toLowerCase()))
  const departments = configuredOptions(settings.departments, [])
  const categories = configuredIncidentCategories(settings.incident_categories, selectedCategory)
  const severities = configuredOptions(settings.severity_levels, [], selectedSeverity)

  const isSaving = createDraft.isPending || updateDraft.isPending
  const isSubmitting = submitIncident.isPending || submitNewIncident.isPending
  const isBusy = isSaving || isSubmitting

  const saveDraft = form.handleSubmit(async (values) => {
    setSubmitError('')
    setSubmitMessage('')
    try {
      const input = toDraftInput(values)
      const saved = draftId ? await updateDraft.mutateAsync({ incidentId: draftId, input }) : await createDraft.mutateAsync(input)
      setDraftId(saved.id)
      setDraftReference(saved.referenceNumber)
      setDraftType('manual')
      setSubmitMessage(`Draft ${saved.referenceNumber} saved as a manual draft. You can continue it later.`)
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
        window.location.hash = '#incidents'
        return
      }

      const submitted = await submitIncident.mutateAsync({ incidentId: activeDraftId, input: validated.data })
      setSubmitMessage(`Report ${submitted.referenceNumber} submitted successfully.`)
      window.location.hash = '#incidents'
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to submit the incident report.')
    }
  }, () => {
    setSubmitError('Please correct the highlighted fields before submitting.')
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

  const resetFieldModeRecorder = () => {
    mediaRecorderRef.current = null
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
    audioChunksRef.current = []
    setFieldModeMuted(false)
  }

  const persistFieldModeRecording = async (file: File) => {
    setFieldModeStatus('saving')
    setSubmitError('')
    setSubmitMessage('')
    try {
      const values = form.getValues()
      const fieldModeValues = {
        ...values,
        title: values.title?.trim() || 'Voice incident report',
        description: values.description?.trim() || 'Voice report attached. Complete the incident details before sending.',
      }
      form.setValue('title', fieldModeValues.title)
      form.setValue('description', fieldModeValues.description)
      const saved = draftId
        ? await updateDraft.mutateAsync({ incidentId: draftId, input: toDraftInput(fieldModeValues) })
        : await createDraft.mutateAsync(toDraftInput(fieldModeValues))
      setDraftId(saved.id)
      setDraftReference(saved.referenceNumber)
      await uploadEvidence.mutateAsync({ incidentId: saved.id, file })
      setSubmitMessage(`Voice recording saved to draft ${saved.referenceNumber}.`)
      setFieldModeStatus('signoff')
    } catch (error) {
      setFieldModeStatus('error')
      setSubmitError(error instanceof Error ? error.message : 'Unable to save the voice recording.')
    }
  }

  const startFieldModeRecording = async () => {
    setSubmitError('')
    setSubmitMessage('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setFieldModeStatus('error')
      setSubmitError('Voice recording is not supported by this browser or device. Use the standard incident form instead.')
      return
    }

    setFieldModeStatus('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((candidate) => MediaRecorder.isTypeSupported(candidate))
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaStreamRef.current = stream
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        resetFieldModeRecorder()
        setFieldModeStatus('error')
        setSubmitError('The voice recorder encountered an error. Please try again or use the standard form.')
      }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        resetFieldModeRecorder()
        if (!blob.size) {
          setFieldModeStatus('error')
          setSubmitError('No audio was recorded. Please try again.')
          return
        }
        const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'
        const file = new File([blob], `voice-incident-${Date.now()}.${extension}`, { type: blob.type })
        const url = URL.createObjectURL(blob)
        setRecordedAudio((current) => {
          if (current?.url) URL.revokeObjectURL(current.url)
          return { file, url }
        })
        void persistFieldModeRecording(file)
      }
      recorder.start()
      setFieldModeStatus('recording')
    } catch (error) {
      resetFieldModeRecorder()
      setFieldModeStatus('error')
      if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
        setSubmitError('Microphone access was denied. Allow microphone access or use the standard incident form.')
      } else {
        setSubmitError('Unable to start voice recording. Check the microphone and try again.')
      }
    }
  }

  const toggleFieldModePause = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return
    if (recorder.state === 'recording') {
      recorder.pause()
      setFieldModeStatus('paused')
    } else if (recorder.state === 'paused') {
      recorder.resume()
      setFieldModeStatus('recording')
    }
  }

  const toggleFieldModeMute = () => {
    const nextMuted = !fieldModeMuted
    mediaStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted })
    setFieldModeMuted(nextMuted)
  }

  const finishFieldModeRecording = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder || (recorder.state !== 'recording' && recorder.state !== 'paused')) return
    recorder.stop()
  }

  const exitFieldMode = () => {
    if (mediaRecorderRef.current?.state === 'recording' || mediaRecorderRef.current?.state === 'paused') mediaRecorderRef.current.stop()
    resetFieldModeRecorder()
    setFieldMode(false)
    setFieldModeStatus('idle')
  }

  const sendFieldModeReport = async () => {
    setSubmitError('')
    const valid = await form.trigger(['title', 'incidentCategory', 'severity', 'occurrenceDate', 'occurrenceTime', 'description', 'siteId'])
    if (!valid) {
      setSubmitError('Complete the incident details before sending the voice report.')
      return
    }
    const values = form.getValues()
    if (!values.accuracyConfirmed) {
      setSubmitError('Confirm that the report is accurate before sending.')
      return
    }
    await submitReport()
  }

  const fieldModeView = fieldModeStatus === 'signoff' ? (
    <section className="incident-form-section">
      <div className="incident-form-section-heading"><div><h3>Review and sign-off</h3><p>Your voice recording has been saved to the draft. Complete the required details before sending.</p></div></div>
      {recordedAudio && <audio controls src={recordedAudio.url} className="incident-field-mode-audio" />}
      <div className="incident-form-grid">
        <label className="incident-form-wide">Incident title *<input {...form.register('title')} />{fieldError(form.formState.errors.title?.message)}</label>
        <label>Incident category *<select {...form.register('incidentCategory')}><option value="">Select incident category</option>{categories.map((category) => <option value={category} key={category}>{category}</option>)}</select>{fieldError(form.formState.errors.incidentCategory?.message)}</label>
        <label>Severity *<select {...form.register('severity')}><option value="">Select severity</option>{severities.map((severity) => <option value={severity} key={severity}>{severity}</option>)}</select>{fieldError(form.formState.errors.severity?.message)}</label>
        <label>Date *<input type="date" {...form.register('occurrenceDate')} />{fieldError(form.formState.errors.occurrenceDate?.message)}</label>
        <label>Time *<input type="time" {...form.register('occurrenceTime')} />{fieldError(form.formState.errors.occurrenceTime?.message)}</label>
        <label>Site *<select {...form.register('siteId')}><option value="">{configuredSites.length ? 'Select site' : 'No sites configured'}</option>{configuredSites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select>{fieldError(form.formState.errors.siteId?.message)}</label>
        <label>Location<input {...form.register('location')} placeholder="Area, unit, or precise location" />{fieldError(form.formState.errors.location?.message)}</label>
        <label className="incident-form-wide">Description *<textarea {...form.register('description')} rows={4} />{fieldError(form.formState.errors.description?.message)}</label>
      </div>
      <label className="checkbox-field"><input type="checkbox" {...form.register('accuracyConfirmed')} /> I confirm this report is accurate to the best of my knowledge. *</label>
      <div className="incident-form-actions"><button className="button button-outline button-large" type="button" disabled={isBusy} onClick={exitFieldMode}>Use standard form</button><button className="button button-green button-large" type="button" disabled={isBusy} onClick={() => void sendFieldModeReport()}>{isSubmitting ? 'Sending...' : 'Send'}</button></div>
    </section>
  ) : (
    <section className="incident-form-section">
      <div className="incident-form-section-heading"><div><h3>Report your incident</h3><p>Record a voice report. Your microphone permission is required.</p></div></div>
      {fieldModeStatus === 'error' && <div className="auth-message error" role="alert">{submitError}</div>}
      <div className="incident-field-mode-controls">
        {fieldModeStatus === 'idle' || fieldModeStatus === 'error' ? <button className="button button-green button-large" type="button" onClick={() => void startFieldModeRecording()}>Start recording</button> : fieldModeStatus === 'requesting' ? <button className="button button-green button-large" type="button" disabled>Requesting microphone...</button> : fieldModeStatus === 'saving' ? <div className="workspace-empty">Saving voice recording...</div> : <><button className="button button-green button-large" type="button" onClick={toggleFieldModeMute}>{fieldModeMuted ? 'Unmute' : 'Mute'}</button><button className="button button-outline button-large" type="button" onClick={toggleFieldModePause}>{fieldModeStatus === 'paused' ? 'Continue' : 'Pause'}</button><button className="button button-green button-large" type="button" onClick={finishFieldModeRecording}>Save / Finish</button></>}
      </div>
      {fieldModeStatus === 'recording' && <p role="status">Recording in progress...</p>}
      {fieldModeStatus === 'paused' && <p role="status">Recording paused.</p>}
      <button className="button button-outline button-small" type="button" onClick={exitFieldMode}>Use standard form</button>
    </section>
  )

  return (
    <div className="incident-form-page">
      <div className="incident-form-header">
        <div>
          <h2>Report an incident</h2>
          <p>Progressive form — drafts are auto-saved and can be submitted offline; they sync when connectivity returns.</p>
        </div>
        <div className="incident-form-header-actions"><a className="button button-outline button-small" href="#my-reports">My Reports</a><button className={`field-mode-toggle${fieldMode ? ' active' : ''}`} type="button" onClick={() => { setFieldMode(true); setFieldModeStatus('idle'); setSubmitError(''); setSubmitMessage('') }}>Field mode</button></div>
        <button className="button button-outline incident-save-button" type="button" disabled={isBusy} onClick={() => void saveDraft()}>Save draft</button>
      </div>
      <div className="incident-stage-progress"><div className="incident-stage-bar"><span style={{ width: `${((activeStage + 1) / stages.length) * 100}%` }} /></div><div className="incident-stage-labels">{stages.map((stage, index) => <button type="button" className={index === activeStage ? 'active' : index < activeStage ? 'complete' : ''} key={stage} onClick={() => index <= activeStage && setActiveStage(index)}>{index + 1}. {stage}</button>)}</div></div>
      <div className="incident-wizard-layout">
        <form className="incident-form" onSubmit={submitReport}>
        {fieldMode ? fieldModeView : <>
        {activeStage === 0 && <section className="incident-form-section">
          <div className="incident-form-section-heading"><div><h3>What happened?</h3><p>Required fields are validated before you can continue.</p></div></div>
          <div className="incident-form-grid">
            <label className="incident-form-wide">Incident title *<input {...form.register('title')} placeholder="Short factual description" />{fieldError(form.formState.errors.title?.message)}</label>
            <label>Incident category *<select {...form.register('incidentCategory')}><option value="">Select incident category</option>{categories.map((category) => <option value={category} key={category}>{category}</option>)}</select>{fieldError(form.formState.errors.incidentCategory?.message)}</label>
            <label>Severity *<select {...form.register('severity')}><option value="">Select severity</option>{severities.map((severity) => <option value={severity} key={severity}>{severity}</option>)}</select>{fieldError(form.formState.errors.severity?.message)}</label>
            <label>Date *<input type="date" {...form.register('occurrenceDate')} />{fieldError(form.formState.errors.occurrenceDate?.message)}</label>
            <label>Time *<input type="time" {...form.register('occurrenceTime')} />{fieldError(form.formState.errors.occurrenceTime?.message)}</label>
            <label className="incident-form-wide">Description *<textarea {...form.register('description')} rows={5} placeholder="Describe the sequence of events factually." />{fieldError(form.formState.errors.description?.message)}</label>
          </div>
        </section>}
        {activeStage === 1 && <section className="incident-form-section">
          <div className="incident-form-section-heading"><div><h3>Where and under what conditions?</h3></div></div>
          <div className="incident-form-grid">
            <label>Site *<select {...form.register('siteId')}><option value="">{configuredSites.length ? 'Select site' : 'No sites configured'}</option>{configuredSites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}</select>{fieldError(form.formState.errors.siteId?.message)}</label>
            <label>Department<select {...form.register('department')}><option value="">Select department</option>{departments.map((department) => <option value={department} key={department}>{department}</option>)}</select></label>
            <label>Facility / area<input {...form.register('location')} placeholder="Area, unit, or precise location" />{fieldError(form.formState.errors.location?.message)}</label>
            <label>Weather conditions<input {...form.register('weatherConditions')} placeholder="32°C, light rain, wind 12 kt" /></label>
            <label className="incident-form-wide">Equipment involved<input {...form.register('equipmentInvolved')} placeholder="Equipment or vehicle involved" /></label>
          </div>
        </section>}
        {activeStage === 2 && <section className="incident-form-section">
          <div className="incident-form-section-heading"><div><h3>Who was involved?</h3></div></div>
          <div className="incident-form-grid">
            <label>Reporter name *<input value={reporterName} readOnly aria-readonly="true" /></label>
            <label>Contractor involved<input {...form.register('contractorOrganization')} placeholder="Contractor organization" />{fieldError(form.formState.errors.contractorOrganization?.message)}</label>
            <label className="incident-form-wide">People involved<textarea {...form.register('peopleInvolved')} rows={3} placeholder="Names, roles and injuries sustained" /></label>
            <label className="incident-form-wide">Immediate actions taken *<textarea {...form.register('immediateCorrection')} rows={4} placeholder="Describe immediate controls, first aid, isolation, notification, or other response." />{fieldError(form.formState.errors.immediateCorrection?.message)}</label>
            <label className="incident-form-wide">Potential root cause<textarea {...form.register('potentialRootCause')} rows={3} placeholder="Initial indication only; formal root-cause analysis follows later." /></label>
          </div>
        </section>}
        {activeStage === 3 && <section className="incident-form-section"><div className="incident-form-section-heading"><div><h3>Evidence and sign-off</h3><p>Images, PDF, Word, Excel, video and voice notes are supported.</p></div></div><div className="incident-evidence-upload-grid"><label className="incident-upload-tile">Photos / video<input type="file" hidden accept="image/*,video/*" onChange={handleEvidence} /></label><label className="incident-upload-tile">Documents<input type="file" hidden accept="application/pdf,.doc,.docx,.xls,.xlsx" onChange={handleEvidence} /></label><label className="incident-upload-tile">Voice recording<input type="file" hidden accept="audio/*" onChange={handleEvidence} /></label></div><label className="checkbox-field"><input type="checkbox" {...form.register('accuracyConfirmed')} /> I confirm this report is accurate to the best of my knowledge. *</label></section>}
        {draftReference && <div className="incident-reference" role="status"><span>{draftType === 'manual' ? 'Manual draft' : 'Draft reference'}</span><strong>{draftReference}</strong></div>}
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
          {activeStage < stages.length - 1 ? <button className="button button-green button-large" type="button" disabled={isBusy} onClick={() => void continueStage()}>Continue</button> : (
            <>
              <button className="button button-outline button-large" type="button" disabled={isBusy} onClick={() => void saveDraft()}>Save as Draft</button>
              <button className="button button-green button-large" type="button" disabled={isBusy} onClick={() => void submitReport()}>{isSubmitting ? 'Submitting incident...' : 'Submit incident'}</button>
            </>
          )}
        </div>
        </>}
        </form>
      </div>
    </div>
  )
}
