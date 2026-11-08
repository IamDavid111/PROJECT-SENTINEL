import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { Button, Card, FormActions, FormMessage, FormSection, PageHeader, Skeleton, Toggle } from '../../components/ui'
import { recordActivity } from '../../lib/activity'
import { supabase } from '../../lib/supabase'

export type PreferenceState = {
  email: boolean
  sms: boolean
  push: boolean
  incident_assignments: boolean
  corrective_action_reminders: boolean
  audit_reminders: boolean
  compliance_obligation_reminders: boolean
}

const CHANNELS: [keyof PreferenceState, string, string][] = [
  ['email', 'Email notifications', 'Receive operational updates by email.'],
  ['sms', 'SMS notifications', 'Receive time-sensitive alerts by text message.'],
  ['push', 'Push notifications', 'Receive in-app and browser notifications.'],
]

const ALERTS: [keyof PreferenceState, string, string][] = [
  ['incident_assignments', 'Incident assignments', 'When an incident is assigned to you.'],
  ['corrective_action_reminders', 'Corrective action reminders', 'When an action is due or overdue.'],
  ['audit_reminders', 'Audit reminders', 'When an audit is scheduled or due.'],
  ['compliance_obligation_reminders', 'Compliance obligation reminders', 'At 30 and 14 days before an obligation expires.'],
]

function PreferenceRow({ label, description, checked, onChange }: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-3 last:border-0">
      <div className="grid gap-0.5">
        <strong className="text-sm font-medium text-foreground">{label}</strong>
        <span className="text-xs text-muted">{description}</span>
      </div>
      <Toggle checked={checked} onCheckedChange={onChange} aria-label={`Toggle ${label}`} />
    </div>
  )
}

export function NotificationPreferencesWorkspace({ userId, organizationId }: { userId: string; organizationId: string }) {
  const [preferences, setPreferences] = useState<PreferenceState>({ email: true, sms: false, push: true, incident_assignments: true, corrective_action_reminders: true, audit_reminders: true, compliance_obligation_reminders: true })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadPreferences = async () => {
      setLoading(true)
      setError('')
      const { data, error: preferencesError } = await supabase.from('notification_preferences').select('email, sms, push, incident_assignments, corrective_action_reminders, audit_reminders, compliance_obligation_reminders').eq('user_id', userId).maybeSingle()
      if (preferencesError) setError(preferencesError.message)
      else if (data) setPreferences(data)
      setLoading(false)
    }
    void loadPreferences()
  }, [userId])

  const savePreferences = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const { error: saveError } = await supabase.from('notification_preferences').upsert({ user_id: userId, ...preferences })
      if (saveError) {
        setError(saveError.message)
      } else {
        await recordActivity(organizationId, userId, 'Notification preferences changed')
        setMessage('Notification preferences saved.')
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save notification preferences.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="grid gap-5">
        <PageHeader eyebrow="Personal settings" title="Notification preferences" description="Choose how SentinelQHSE keeps you informed about operational work." />
        <Skeleton className="h-[320px] rounded-card" />
        <Skeleton className="h-[260px] rounded-card" />
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Personal settings"
        title="Notification preferences"
        description="Choose how SentinelQHSE keeps you informed about operational work."
      />

      <Card className="p-5 shadow-none">
        <form className="grid gap-6" onSubmit={savePreferences}>
          <FormSection title="Channels" description="How SentinelQHSE reaches you.">
            <div className="grid">
              {CHANNELS.map(([key, label, description]) => (
                <PreferenceRow
                  key={key}
                  label={label}
                  description={description}
                  checked={preferences[key]}
                  onChange={(checked) => setPreferences((current) => ({ ...current, [key]: checked }))}
                />
              ))}
            </div>
          </FormSection>

          <FormSection title="Operational alerts" description="Which updates you receive.">
            <div className="grid">
              {ALERTS.map(([key, label, description]) => (
                <PreferenceRow
                  key={key}
                  label={label}
                  description={description}
                  checked={preferences[key]}
                  onChange={(checked) => setPreferences((current) => ({ ...current, [key]: checked }))}
                />
              ))}
            </div>
          </FormSection>

          <FormMessage error={error} success={message} />
          <FormActions>
            <Button type="submit" loading={saving}>Save preferences</Button>
          </FormActions>
        </form>
      </Card>
    </div>
  )
}
