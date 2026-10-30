import { useState } from 'react'
import type { FormEvent } from 'react'

import { Button, Field, Input, Textarea } from '../../components/ui'
import { Icon } from '../../components/ui/icon'
import { AuthLayout } from './AuthLayout'
import { FormMessage } from '../../components/ui/form-message'

export function DemoRequestPage() {
  const [submitted, setSubmitted] = useState(false)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
  }
  return (
    <AuthLayout
      title="Contact sales & request a demo"
      subtitle="Tell us about your operation and our team will arrange a SentinelQHSE walkthrough or commercial consultation."
    >
      {submitted ? (
        <div className="grid gap-4">
          <FormMessage success="Thanks. Your request has been recorded for follow-up." />
          <Button type="button" className="w-full" onClick={() => { window.location.hash = '#top' }}>
            Return to landing page
          </Button>
        </div>
      ) : (
        <form className="grid gap-4" onSubmit={submit}>
          <Field label="Full name" htmlFor="name">
            <Input id="name" name="name" placeholder="Your full name" required />
          </Field>
          <Field label="Work email" htmlFor="email">
            <Input id="email" name="email" type="email" placeholder="you@company.com" required />
          </Field>
          <Field label="Company" htmlFor="company">
            <Input id="company" name="company" placeholder="Company name" required />
          </Field>
          <Field label="What would you like to explore?" htmlFor="message">
            <Textarea id="message" name="message" rows={4} placeholder="Sites, teams, pricing, or QHSE workflows" />
          </Field>
          <Button type="submit" className="w-full">
            Submit request <Icon name="arrowRight" size={15} />
          </Button>
          <p className="text-center text-sm text-muted">
            <a href="#top" className="font-medium text-brand-dark underline-offset-4 hover:underline">Return to landing page</a>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}