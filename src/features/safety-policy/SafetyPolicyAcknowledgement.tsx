import { useEffect, useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'

import { Alert, Button, Spinner } from '../../components/ui'
import { BrandedBackground } from '../../components/brand/BrandedBackground'
import type { SafetyPolicy } from './safetyPolicyService'
import './SafetyPolicyAcknowledgement.css'

export function SafetyPolicyAcknowledgement({
  policy,
  loading,
  error,
  onRetry,
  onSignOut,
  onAcknowledge,
  isDarkMode,
}: {
  policy: SafetyPolicy | null
  loading: boolean
  error: string
  onRetry: () => void
  onSignOut: () => void
  onAcknowledge: (onRecorded: () => void) => Promise<void>
  isDarkMode: boolean
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [checked, setChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.focus()
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ))
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    dialog.addEventListener('keydown', trapFocus)
    return () => dialog.removeEventListener('keydown', trapFocus)
  }, [])

  const continueToDashboard = async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      await onAcknowledge(() => setClosing(true))
    } catch (caught) {
      setClosing(false)
      setSubmitError(caught instanceof Error ? caught.message : 'Unable to record your acknowledgement.')
    } finally {
      setSubmitting(false)
    }
  }

  const effectiveDate = policy?.effectiveAt
    ? new Date(policy.effectiveAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    : null

  return (
    <div className={`fixed inset-0 z-[100] isolate grid place-items-center overflow-y-auto bg-ink p-4 text-white sm:p-6${isDarkMode ? ' dark-theme' : ''}`}>
      <BrandedBackground />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="safety-policy-heading"
        tabIndex={-1}
        className={`relative my-auto grid w-[min(90vw,640px)] max-h-[92vh] overflow-hidden rounded-[18px] border border-line bg-surface p-5 text-foreground shadow-2xl outline-none sm:p-8 ${closing ? 'safety-policy-card-closing' : 'safety-policy-card'}`}
      >
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
            <ShieldCheck size={23} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">Safety Policy</p>
            <h1 id="safety-policy-heading" className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {loading ? 'Verifying your policy' : policy?.title || 'Safety Policy'}
            </h1>
            {!loading && policy && (
              <p className="mt-2 text-xs text-muted">
                Version {policy.versionNumber}{effectiveDate ? ` · Effective ${effectiveDate}` : ''}
              </p>
            )}
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-48 place-items-center py-10" role="status">
            <div className="flex items-center gap-3 text-sm text-muted">
              <Spinner size={18} fill="currentColor" className="text-brand" label="Loading safety policy" />
              Loading and verifying your company policy…
            </div>
          </div>
        ) : error ? (
          <div className="grid gap-4 py-8">
            <Alert tone="danger">{error}</Alert>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button className="w-full" onClick={onRetry}>Retry</Button>
              <Button variant="outline" className="w-full" onClick={onSignOut}>Sign out</Button>
            </div>
          </div>
        ) : policy ? (
          <>
            <div className="relative mt-6 min-h-0 overflow-hidden">
              <div className="max-h-[50vh] overflow-y-auto pr-2 text-sm leading-[1.6] text-foreground/90">
                <p className="whitespace-pre-wrap">{policy.text}</p>
              </div>
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface to-transparent" />
            </div>

            <div className="mt-5 grid gap-4 border-t border-line pt-5">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl p-1 text-sm leading-6">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                  className="mt-1 h-5 w-5 shrink-0 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                />
                <span>I have read and acknowledge this safety policy</span>
              </label>
              {submitError && <Alert tone="danger">{submitError}</Alert>}
              <Button
                size="lg"
                className="w-full"
                disabled={!checked || submitting}
                loading={submitting}
                onClick={() => void continueToDashboard()}
              >
                I Acknowledge & Continue
              </Button>
              <p className="text-center text-xs text-muted">Acknowledgement is required to continue.</p>
            </div>
          </>
        ) : (
          <div className="py-8">
            <Alert tone="danger">Unable to verify the active Safety Policy. Protected access remains locked.</Alert>
            <Button className="mt-4 w-full" onClick={onRetry}>Retry</Button>
          </div>
        )}
      </div>
    </div>
  )
}
