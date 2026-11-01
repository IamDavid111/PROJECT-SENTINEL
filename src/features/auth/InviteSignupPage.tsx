import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import { pinAuthRouteToHash } from '../../app/routing'
import { Button, Field, Input } from '../../components/ui'
import { registrationSchema } from '../../lib/schemas'
import { supabase } from '../../lib/supabase'
import { AuthLayout } from './AuthLayout'
import { FormMessage } from '../../components/ui/form-message'
import { PasswordInput } from './PasswordInput'
import { reportSetupFailure, setupFailedMessage, type InvitationDetails } from './setupErrors'

export function InviteSignupPage() {
  const [details, setDetails] = useState<InvitationDetails | null>(null)
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loadInvitation = async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session) {
        setError('This invitation link must be opened from the invitation email.')
        setLoading(false)
        return
      }

      const { data, error: invitationError } = await supabase.functions.invoke('accept-admin-invitation')
      if (invitationError) {
        reportSetupFailure('could not load the invitation', invitationError)
        setError(setupFailedMessage)
      } else if (!data?.invitation) setError('This invitation is expired, revoked, already accepted, or does not match this email account.')
      else setDetails(data.invitation as InvitationDetails)
      setLoading(false)
    }
    void loadInvitation()
  }, [])

  useEffect(() => {
    if (details) pinAuthRouteToHash('invite-signup')
  }, [details])

  const completeSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (!fullName.trim()) {
      setError('Full name is required.')
      return
    }
    const passwordResult = registrationSchema.shape.password.safeParse(password)
    if (!passwordResult.success) {
      setError(passwordResult.error.issues[0]?.message || 'Password must be at least 8 characters.')
      return
    }
    setSubmitting(true)
    if (password !== confirmPassword) {
      setSubmitting(false)
      setError('Passwords do not match.')
      return
    }
    const { error: passwordError } = await supabase.auth.updateUser({ password })
    if (passwordError) {
      reportSetupFailure('could not set the password', passwordError)
      setSubmitting(false)
      setError('We could not save your new password. Please try again, or ask your administrator for help.')
      return
    }
    const { data, error: acceptanceError } = await supabase.functions.invoke('accept-admin-invitation', {
      body: { fullName: fullName.trim() },
    })
    setSubmitting(false)
    if (acceptanceError || !data?.accepted) {
      if (acceptanceError) reportSetupFailure('could not accept the invitation', acceptanceError)
      setError(setupFailedMessage)
      return
    }
    setMessage('Your account is ready. Taking you to your workspace...')
    window.setTimeout(() => { window.location.hash = '#dashboard' }, 800)
  }

  return (
    <AuthLayout
      title="Set up your account"
      subtitle="Confirm your invitation details and create your account password."
    >
      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted" role="status">
          Validating invitation…
        </div>
      ) : details ? (
        <form className="grid gap-4" onSubmit={completeSignup}>
          <Field label="Work email" htmlFor="inviteeEmail">
            <Input id="inviteeEmail" value={details.inviteeEmail} readOnly />
          </Field>
          <Field label="Organization" htmlFor="organizationName">
            <Input id="organizationName" value={details.organizationName} readOnly />
          </Field>
          <Field label="Department" htmlFor="department">
            <Input id="department" value={details.department || 'Not assigned'} readOnly />
          </Field>
          <Field label="Role" htmlFor="role">
            <Input id="role" value={details.role} readOnly />
          </Field>
          <Field label="Full name" htmlFor="fullName">
            <Input id="fullName" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 8 characters.">
            <PasswordInput
              id="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>
          <Field label="Confirm password" htmlFor="confirmPassword">
            <PasswordInput
              id="confirmPassword"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>
          <FormMessage error={error} success={message} />
          <Button type="submit" className="w-full" loading={submitting}>
            {submitting ? 'Setting up account…' : 'Set up account'}
          </Button>
        </form>
      ) : (
        <div className="grid gap-4">
          <FormMessage error={error} />
          <Button variant="outline" className="w-full" onClick={() => { window.location.hash = '#sign-in' }}>
            Return to sign in
          </Button>
        </div>
      )}
    </AuthLayout>
  )
}