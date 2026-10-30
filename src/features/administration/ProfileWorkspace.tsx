import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { FormMessage } from '../../components/ui/form-message'
import { recordActivity } from '../../lib/activity'
import { supabase } from '../../lib/supabase'

export function ProfileWorkspace({ userId, organizationId, email }: { userId: string; organizationId: string; email: string }) {
  const [identity, setIdentity] = useState({ full_name: '', employee_id: '', department: '' })
  const [profile, setProfile] = useState({ phone: '', emergency_contact: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadProfile = async () => {
      const { data, error: profileError } = await supabase.from('profiles').select('full_name, employee_id, department, phone, emergency_contact').eq('id', userId).single()
      if (profileError) setError(profileError.message)
      else if (data) {
        setIdentity({ full_name: data.full_name || '', employee_id: data.employee_id || '', department: data.department || '' })
        setProfile({ phone: data.phone || '', emergency_contact: data.emergency_contact || '' })
      }
      setLoading(false)
    }
    void loadProfile()
  }, [userId])

  const updateField = (field: keyof typeof profile, value: string) => setProfile((current) => ({ ...current, [field]: value }))
  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    const { error: updateError } = await supabase.from('profiles').update({ phone: profile.phone, emergency_contact: profile.emergency_contact }).eq('id', userId).eq('organization_id', organizationId)
    if (updateError) setError(updateError.message)
    else {
      await recordActivity(organizationId, userId, 'Profile updated')
      setMessage('Profile updated successfully.')
    }
  }

  if (loading) return <div className="workspace-panel">Loading profile...</div>
  return (
    <div className="workspace-panel">
      <div className="eyebrow">ACCOUNT PROFILE</div>
      <h2>My Profile</h2>
      <p>Maintain the identity and contact information used across your organization.</p>
      <form className="workspace-form" onSubmit={saveProfile}>
        <label>Full name<input value={identity.full_name} disabled /><small className="profile-managed-note">Managed by your administrator.</small></label>
        <label>Work email<input value={email} disabled /><small className="profile-managed-note">Managed by your administrator.</small></label>
        <label>Employee ID<input value={identity.employee_id} disabled /><small className="profile-managed-note">Managed by your administrator.</small></label>
        <label>Department<input value={identity.department} disabled /><small className="profile-managed-note">Managed by your administrator.</small></label>
        <label>Phone number<input value={profile.phone} onChange={(event) => updateField('phone', event.target.value)} /></label>
        <label>Emergency contact<input value={profile.emergency_contact} onChange={(event) => updateField('emergency_contact', event.target.value)} /></label>
        <FormMessage error={error} success={message} />
        <button className="button button-green auth-submit">Save profile</button>
      </form>
    </div>
  )
}

