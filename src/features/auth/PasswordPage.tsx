import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button, Field } from '../../components/ui'
import { Icon } from '../../components/ui/icon'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import { AuthLayout } from './AuthLayout'
import { FormMessage } from '../../components/ui/form-message'
import { PasswordInput } from './PasswordInput'

export function PasswordPage({ reset = false }: { reset?: boolean }) {
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') || '')
    const confirmation = String(form.get('confirmation') || '')
    if (password.length < 8 || password !== confirmation) return setError('Passwords must match and contain at least 8 characters.')
    if (!isSupabaseConfigured) return setError('Supabase is not configured. Add the required environment variables first.')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) setError(updateError.message)
    else setMessage(reset ? 'Your password has been reset successfully.' : 'Your password has been changed successfully.')
  }
  return (
    <AuthLayout
      title={reset ? 'Set a new password' : 'Change your password'}
      subtitle="Create a strong password for your SentinelQHSE account."
    >
      <form className="grid gap-4" onSubmit={submit}>
        {!reset && (
          <Field label="Current password" htmlFor="currentPassword">
            <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" />
          </Field>
        )}
        <Field label="New password" htmlFor="password" hint="At least 8 characters.">
          <PasswordInput id="password" name="password" autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmation">
          <PasswordInput id="confirmation" name="confirmation" autoComplete="new-password" />
        </Field>
        <FormMessage error={error} success={message} />
        <Button type="submit" className="w-full">
          Update password <Icon name="arrowRight" size={15} />
        </Button>
      </form>
    </AuthLayout>
  )
}