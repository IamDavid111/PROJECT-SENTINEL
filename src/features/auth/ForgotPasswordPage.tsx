import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button, Field, Input } from '../../components/ui'
import { Icon } from '../../components/ui/icon'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { AuthLayout } from './AuthLayout'
import { FormMessage } from '../../components/ui/form-message'

export function ForgotPasswordPage() {
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') || '')
    if (!email) return setError('Enter your work email.')
    if (!isSupabaseConfigured) return setError('Supabase is not configured. Add the required environment variables first.')
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/?reset=1` })
    if (resetError) setError(resetError.message)
    else setMessage('If an account exists for that email, a password reset link has been sent.')
  }
  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Enter your work email and we will send a secure reset link."
    >
      <form className="grid gap-4" onSubmit={submit}>
        <Field label="Work email" htmlFor="email">
          <Input id="email" name="email" type="email" placeholder="you@company.com" autoComplete="email" />
        </Field>
        <FormMessage error={error} success={message} />
        <Button type="submit" className="w-full">
          Send reset link <Icon name="arrowRight" size={15} />
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        <a href="#sign-in" className="font-medium text-brand-dark underline-offset-4 hover:underline">Return to sign in</a>
      </p>
    </AuthLayout>
  )
}