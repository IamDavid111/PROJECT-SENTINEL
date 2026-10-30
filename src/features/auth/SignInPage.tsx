import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button, Checkbox, Field, Input, SegmentedControl } from '../../components/ui'
import { Icon } from '../../components/ui/icon'
import { recordActivity } from '../../lib/activity'
import { companyCodeSchema } from '../../lib/schemas'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { AuthLayout } from './AuthLayout'
import { FormMessage } from '../../components/ui/form-message'
import { PasswordInput } from './PasswordInput'

export function SignInPage({ userOnly = false }: { userOnly?: boolean }) {
  const [error, setError] = useState('')
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const [confirmationMessage, setConfirmationMessage] = useState('')
  const [resendingConfirmation, setResendingConfirmation] = useState(false)
  const [loading, setLoading] = useState(false)
  const [signInType, setSignInType] = useState<'admin' | 'user'>('user')
  const [rememberMe, setRememberMe] = useState(true)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setConfirmationEmail('')
    setConfirmationMessage('')
    const form = new FormData(event.currentTarget)
    const selectedSignInType = signInType
    const email = String(form.get('email') || '')
    const password = String(form.get('password') || '')
    const companyCode = selectedSignInType === 'admin' ? String(form.get('companyCode') || '').trim().toUpperCase() : ''
    if (!email || !password) {
      setError('Work email and password are required.')
      return
    }
    if (selectedSignInType === 'admin') {
      const companyCodeResult = companyCodeSchema.safeParse(companyCode)
      if (!companyCodeResult.success) {
        setError(companyCodeResult.error.issues[0]?.message || 'Company code is required.')
        return
      }
    }
    if (!isSupabaseConfigured) {
      setError('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local.')
      return
    }
    setLoading(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(signInError.code === 'email_not_confirmed' ? 'This email address has not been confirmed yet.' : signInError.message)
      if (signInError.code === 'email_not_confirmed') setConfirmationEmail(email)
    }
    else {
      const { data: userData } = await supabase.auth.getUser()
      const { data: profile } = await supabase.from('profiles').select('id, organization_id').eq('id', userData.user?.id || '').maybeSingle()
      if (selectedSignInType === 'admin') {
        const { data: organization } = profile?.organization_id
          ? await supabase.from('organizations').select('id').eq('id', profile.organization_id).eq('company_code', companyCode).maybeSingle()
          : { data: null }
        if (!organization) {
          await supabase.auth.signOut()
          setLoading(false)
          setError('Company code does not match your organization.')
          return
        }
      }
      if (profile?.organization_id) await recordActivity(profile.organization_id, profile.id, 'User logged in')
      setLoading(false)
      window.location.hash = '#dashboard'
    }
    if (signInError) setLoading(false)
  }

  const resendConfirmation = async () => {
    setError('')
    setConfirmationMessage('')
    setResendingConfirmation(true)
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: confirmationEmail,
      options: { emailRedirectTo: `${window.location.origin}/#/sign-in` },
    })
    setResendingConfirmation(false)
    if (resendError) setError(resendError.message)
    else setConfirmationMessage('Confirmation email sent. Check your inbox and spam folder.')
  }

  return (
    <AuthLayout
      title="Sign in to your workspace"
      subtitle="Use your organization credentials to access safety operations."
      footer={
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-muted">
          {['Organization-scoped', 'Encrypted session', 'Audited access'].map((item) => (
            <span key={item} className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-brand" />
              {item}
            </span>
          ))}
        </div>
      }
    >
      <form className="grid gap-4" onSubmit={submit}>
        {!userOnly && (
          <div className="grid gap-1.5">
            <span className="text-sm font-medium text-foreground">Sign in as</span>
            <SegmentedControl
              label="Sign in as"
              options={[
                { value: 'user', label: 'Team member' },
                { value: 'admin', label: 'Organization admin' },
              ]}
              value={signInType}
              onChange={setSignInType}
              className="w-full"
            />
          </div>
        )}

        {signInType === 'admin' && !userOnly && (
          <Field label="Company code" htmlFor="companyCode" hint="Provided in your organization welcome email.">
            <Input
              id="companyCode"
              name="companyCode"
              placeholder="SENT-XXXXXX"
              autoComplete="organization"
              className="font-mono uppercase tracking-[0.08em]"
            />
          </Field>
        )}

        <Field label="Work email" htmlFor="email">
          <Input id="email" name="email" type="email" placeholder="you@company.com" autoComplete="email" />
        </Field>

        <Field label="Password" htmlFor="password">
          <PasswordInput id="password" name="password" placeholder="Enter your password" autoComplete="current-password" />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Checkbox checked={rememberMe} onChange={setRememberMe} label="Remember me" />
          <a href="#forgot-password" className="text-sm font-medium text-brand-dark underline-offset-4 hover:underline">
            Forgot password?
          </a>
        </div>

        <FormMessage error={error} success={confirmationMessage} />

        {confirmationEmail && (
          <p className="text-xs text-muted">
            <button
              type="button"
              onClick={() => void resendConfirmation()}
              disabled={resendingConfirmation || loading}
              className="font-medium text-brand-dark underline underline-offset-4 disabled:opacity-50"
            >
              {resendingConfirmation ? 'Sending confirmation email…' : 'Resend confirmation email'}
            </button>
          </p>
        )}

        <Button type="submit" className="w-full" loading={loading}>
          {loading ? 'Signing in…' : <><span>Sign in</span><Icon name="arrowRight" size={15} /></>}
        </Button>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-sm">
        <span className="text-muted">New organization?</span>
        <a href="#register" className="font-medium text-brand-dark underline-offset-4 hover:underline">
          Register your company
        </a>
      </div>
    </AuthLayout>
  )
}