import { useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import type { Role } from '../../types'
import { incidentReportTypes, type IncidentReportType } from './incidentTypes'
import { IncidentReportForm } from './IncidentReportForm'
import { useIncident } from './useIncidentData'

const reportTypeDetails: Record<IncidentReportType, { label: string; description: string; icon: string }> = {
  incident: {
    label: 'Report Incident',
    description: 'Record an actual undesired event involving injury, damage, environmental impact, or operational disruption.',
    icon: '!',
  },
  near_miss: {
    label: 'Report Near Miss',
    description: 'Capture an event that could reasonably have caused harm, damage, or loss but did not.',
    icon: '◎',
  },
  unsafe_act: {
    label: 'Report Unsafe Act',
    description: 'Report an unsafe behavior or action observed during work.',
    icon: '⚠',
  },
  unsafe_condition: {
    label: 'Report Unsafe Condition',
    description: 'Report an unsafe physical, environmental, or workplace condition.',
    icon: '⌂',
  },
  environmental_incident: {
    label: 'Report Environmental Incident',
    description: 'Record an event involving actual or potential environmental impact.',
    icon: '♧',
  },
}

const roleReportTypes: Partial<Record<Role, IncidentReportType[]>> = {
  'Super Administrator': [...incidentReportTypes],
  'Organization Administrator': [...incidentReportTypes],
  'QHSE Manager': [...incidentReportTypes],
  'Site Supervisor': [...incidentReportTypes],
  'Safety Officer / HSE Officer': [...incidentReportTypes],
  'Maintenance Engineer': ['incident', 'near_miss', 'unsafe_act', 'unsafe_condition'],
  'Field Worker': ['incident', 'near_miss', 'unsafe_act', 'unsafe_condition'],
  Contractor: ['incident', 'near_miss', 'unsafe_act', 'unsafe_condition'],
}

export type QuickIncidentOption = {
  id: string
  title: string
  reportType: IncidentReportType
  category: string
  environmentalImpact?: boolean
}

export const quickIncidentOptions: QuickIncidentOption[] = [
  { id: 'near_miss', title: 'Near miss', reportType: 'near_miss', category: 'Near Miss' },
  { id: 'unsafe_condition', title: 'Unsafe condition', reportType: 'unsafe_condition', category: 'Unsafe Condition' },
  { id: 'slip_trip_fall', title: 'Slip / trip / fall', reportType: 'incident', category: 'Injury' },
  { id: 'minor_spill', title: 'Minor spill', reportType: 'environmental_incident', category: 'Oil Spill', environmentalImpact: true },
  { id: 'vehicle_incident', title: 'Vehicle incident', reportType: 'incident', category: 'Vehicle Incident' },
]

export function IncidentTypeSelectionPage({ role, supabase, draftId }: { role: Role; supabase: SupabaseClient; draftId?: string | null }) {
  const allowedTypes = useMemo(() => roleReportTypes[role] || [], [role])
  const [selectedType, setSelectedType] = useState<IncidentReportType | null>(allowedTypes[0] || null)
  const [selectedQuickId, setSelectedQuickId] = useState<string | null>(null)
  const [selectedTitle, setSelectedTitle] = useState<string>('Incident')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedEnvironmentalImpact, setSelectedEnvironmentalImpact] = useState<boolean>(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const draft = useIncident(supabase, draftId || null)
  const [message, setMessage] = useState('')

  const handleSelectReportType = (type: IncidentReportType) => {
    setSelectedType(type)
    setSelectedQuickId(null)
    const label = reportTypeDetails[type]?.label.replace('Report ', '') || 'Incident'
    setSelectedTitle(label)
    setSelectedCategory('')
    setSelectedEnvironmentalImpact(type === 'environmental_incident')
    setMessage('')
  }

  const handleSelectQuickOption = (option: QuickIncidentOption) => {
    setSelectedQuickId(option.id)
    setSelectedType(option.reportType)
    setSelectedTitle(option.title)
    setSelectedCategory(option.category)
    setSelectedEnvironmentalImpact(!!option.environmentalImpact)
    setMessage('')
  }

  const continueToReport = () => {
    if (!selectedType) return
    setIsFormOpen(true)
  }

  if (!allowedTypes.length) {
    return <div className="workspace-panel incident-access-panel"><div className="eyebrow">REPORTING ACCESS</div><h2>Reporting is not available for this role</h2><p>Your current role does not have permission to create incident reports. Contact your organization administrator if your access should change.</p><a className="button button-outline workspace-back-link" href="#dashboard">Return to dashboard</a></div>
  }

  if (draftId) {
    if (draft.isLoading) return <div className="workspace-panel">Loading draft...</div>
    if (draft.isError || !draft.data || draft.data.status !== 'draft') return <div className="workspace-panel"><div className="auth-message error">This draft could not be loaded or is no longer editable.</div><a className="button button-outline workspace-back-link" href="#my-reports">Return to My Reports</a></div>
    return <IncidentReportForm supabase={supabase} reportType={draft.data.reportType} draftId={draft.data.id} initialIncident={draft.data} onBack={() => { window.location.hash = '#my-reports' }} />
  }

  if (isFormOpen && selectedType) {
    return (
      <IncidentReportForm
        supabase={supabase}
        reportType={selectedType}
        initialTitle={selectedTitle}
        initialCategory={selectedCategory}
        initialEnvironmentalImpact={selectedEnvironmentalImpact}
        onBack={() => setIsFormOpen(false)}
      />
    )
  }

  return (
    <div className="incident-type-page">
      <div className="incident-type-header">
        <div>
          <div className="eyebrow">REPORT INCIDENT</div>
          <h2>What would you like to report?</h2>
          <p>Select the report type or a quick field event that best describes the incident. Each selection automatically pre-fills and can be edited on the report slides.</p>
        </div>
        <div className="incident-role-context">
          <span>Reporting as</span>
          <strong>{role}</strong>
        </div>
      </div>

      <div className="incident-selection-container">
        <div className="incident-type-grid">
          {allowedTypes.map((type) => {
            const detail = reportTypeDetails[type]
            const selected = selectedType === type && !selectedQuickId
            return (
              <button
                className={`incident-type-card${selected ? ' selected' : ''}`}
                type="button"
                key={type}
                onClick={() => handleSelectReportType(type)}
                aria-pressed={selected}
              >
                <span className="incident-type-icon" aria-hidden="true">{detail.icon}</span>
                <span className="incident-type-copy">
                  <strong>{detail.label}</strong>
                  <small>{detail.description}</small>
                </span>
                <span className="incident-type-check" aria-hidden="true">{selected ? '✓' : '○'}</span>
              </button>
            )
          })}
        </div>

        <div className="incident-quick-options-panel">
          <div className="incident-quick-header">
            <h3>Quick event classifications</h3>
            <p>Auto-populates the incident title and category for immediate reporting:</p>
          </div>
          <div className="incident-quick-list">
            {quickIncidentOptions.map((opt) => {
              const selected = selectedQuickId === opt.id
              return (
                <button
                  className={`incident-quick-pill${selected ? ' selected' : ''}`}
                  type="button"
                  key={opt.id}
                  onClick={() => handleSelectQuickOption(opt)}
                  aria-pressed={selected}
                >
                  <span className="incident-quick-title">{opt.title}</span>
                  <span className="incident-quick-badge">{opt.category}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="incident-workflow-cards">
        <article className="incident-quick-options-panel incident-workflow-card">
          <div className="incident-quick-header"><h3>My Reports</h3><p>Review the incident reports you have submitted.</p></div>
          <a className="button button-outline button-small" href="#my-reports">Open My Reports</a>
        </article>
      </div>

      <div className="incident-type-actions">
        <button className="button button-green button-large" type="button" disabled={!selectedType} onClick={continueToReport}>
          Continue to report →
        </button>
        <a className="button button-outline button-large" href="#dashboard">Cancel</a>
      </div>
      {message && <div className="auth-message success" role="status">{message}</div>}
    </div>
  )
}
