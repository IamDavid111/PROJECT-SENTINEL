import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { FormMessage } from '../../components/ui/form-message'
import { recordActivity } from '../../lib/activity'
import { supabase } from '../../lib/supabase'

export type PreferenceState = {
  email: boolean
  sms: boolean
  push: boolean
  incident_assignments: boolean
  corrective_action_reminders: boolean
  audit_reminders: boolean
}

export function NotificationPreferencesWorkspace({ userId, organizationId }: { userId: string; organizationId: string }) {
  const [preferences, setPreferences] = useState<PreferenceState>({ email: true, sms: false, push: true, incident_assignments: true, corrective_action_reminders: true, audit_reminders: true })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const loadPreferences = async () => {
      const { data, error: preferencesError } = await supabase.from('notification_preferences').select('email, sms, push, incident_assignments, corrective_action_reminders, audit_reminders').eq('user_id', userId).maybeSingle()
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
    const { error: saveError } = await supabase.from('notification_preferences').upsert({ user_id: userId, ...preferences })
    if (saveError) setError(saveError.message)
    else {
      await recordActivity(organizationId, userId, 'Notification preferences changed')
      setMessage('Notification preferences saved.')
    }
  }
  if (loading) return <div className="workspace-panel">Loading notification preferences...</div>
  const labels: [keyof PreferenceState, string][] = [['email', 'Email notifications'], ['sms', 'SMS notifications'], ['push', 'Push notifications'], ['incident_assignments', 'Incident assignments'], ['corrective_action_reminders', 'Corrective action reminders'], ['audit_reminders', 'Audit reminders']]
  return <div className="workspace-panel preferences-panel"><div className="eyebrow">PERSONAL SETTINGS</div><h2>Notification Preferences</h2><p>Choose how SentinelQHSE keeps you informed about operational work.</p><form className="preference-form" onSubmit={savePreferences}>{labels.map(([key, label]) => <label className="preference-row" key={key}><span><strong>{label}</strong><small>Receive relevant updates through this channel</small></span><input type="checkbox" checked={preferences[key]} onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}<FormMessage error={error} success={message} /><button className="button button-green auth-submit">Save preferences</button></form></div>
}

