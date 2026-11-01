import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import {
  Avatar,
  Badge,
  Button,
  Card,
  DetailList,
  Field,
  FormActions,
  FormGrid,
  FormMessage,
  FormSection,
  Input,
  PageHeader,
  Skeleton,
} from '../../components/ui'
import { recordActivity } from '../../lib/activity'
import { supabase } from '../../lib/supabase'

export function ProfileWorkspace({ userId, organizationId, email }: { userId: string; organizationId: string; email: string }) {
  const [identity, setIdentity] = useState({ full_name: '', employee_id: '', department: '' })
  const [profile, setProfile] = useState({ phone: '', emergency_contact: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true)
      setError('')
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
    setSaving(true)
    try {
      const { error: updateError } = await supabase.from('profiles').update({ phone: profile.phone, emergency_contact: profile.emergency_contact }).eq('id', userId).eq('organization_id', organizationId)
      if (updateError) {
        setError(updateError.message)
      } else {
        await recordActivity(organizationId, userId, 'Profile updated')
        setMessage('Profile updated successfully.')
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save your profile.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="grid gap-5">
        <PageHeader eyebrow="Account profile" title="My profile" description="Maintain the identity and contact information used across your organization." />
        <Skeleton className="h-[220px] rounded-card" />
        <Skeleton className="h-[240px] rounded-card" />
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Account profile"
        title="My profile"
        description="Maintain the identity and contact information used across your organization."
      />

      <Card className="p-5 shadow-none">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar name={identity.full_name || email} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-xl font-semibold tracking-tight text-foreground">{identity.full_name || 'Your profile'}</h2>
            <p className="truncate text-sm text-muted">{email}</p>
          </div>
          <Badge tone="neutral" className="sm:ml-auto">Managed by admin</Badge>
        </div>

        <DetailList
          className="mt-5"
          columns={2}
          items={[
            { label: 'Full name', value: identity.full_name || '—' },
            { label: 'Work email', value: email || '—' },
            { label: 'Employee ID', value: identity.employee_id || '—' },
            { label: 'Department', value: identity.department || '—' },
          ]}
        />
        <p className="mt-4 text-xs text-muted">Identity fields are managed by your administrator.</p>
      </Card>

      <Card className="p-5 shadow-none">
        <form className="grid gap-5" onSubmit={saveProfile}>
          <FormSection title="Contact details" description="Used for operational contact and emergency response.">
            <FormGrid>
              <Field label="Phone number" htmlFor="profile-phone">
                <Input
                  id="profile-phone"
                  type="tel"
                  autoComplete="tel"
                  value={profile.phone}
                  onChange={(event) => updateField('phone', event.target.value)}
                />
              </Field>
              <Field label="Emergency contact" htmlFor="profile-emergency">
                <Input
                  id="profile-emergency"
                  value={profile.emergency_contact}
                  onChange={(event) => updateField('emergency_contact', event.target.value)}
                />
              </Field>
            </FormGrid>
          </FormSection>

          <FormMessage error={error} success={message} />
          <FormActions>
            <Button type="submit" loading={saving}>Save profile</Button>
          </FormActions>
        </form>
      </Card>
    </div>
  )
}
