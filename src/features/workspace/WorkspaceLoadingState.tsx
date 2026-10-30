import { useEffect, useState } from 'react'

import { BrandLockup } from '../../components/brand/BrandLockup'
import { Button } from '../../components/ui/button'
import { Icon } from '../../components/ui/icon'
import { Spinner } from '../../components/ui/spinner'
import { cn } from '../../lib/utils'

const SAFETY_BRIEFS = [
  'Every incident reported is an opportunity to prevent the next one.',
  'Safe operations begin with visible leadership.',
  'Near misses are early warnings, not minor events.',
  'Every corrective action should prevent recurrence.',
  'Good safety data turns uncertainty into action.',
  'The strongest safety culture makes reporting easy.',
  'Stop work when conditions change.',
  'Report the hazard before it becomes an incident.',
  'Control the immediate risk first.',
  'Verify that the fix actually worked.',
]

export function WorkspaceLoadingState({ backgroundImage, canProceed, secondsUntilAuto, onProceed, isDarkMode }: { backgroundImage: string; canProceed: boolean; secondsUntilAuto: number; onProceed: () => void; isDarkMode: boolean }) {
  const [briefIndex, setBriefIndex] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const interval = window.setInterval(() => setBriefIndex((current) => (current + 1) % SAFETY_BRIEFS.length), 4000)
    return () => window.clearInterval(interval)
  }, [])

  const steps = [
    { label: 'Organization access', done: canProceed, active: !canProceed },
    { label: 'Operational settings', done: canProceed, active: false },
    { label: 'Role permissions', done: canProceed, active: false },
  ]

  return (
    <div
      className={cn('grid min-h-screen place-items-center bg-ink p-6', isDarkMode && 'dark-theme')}
      style={{
        backgroundImage: `linear-gradient(100deg, rgba(4, 13, 28, 0.95), rgba(4, 13, 28, 0.68)), url(${backgroundImage})`,
        backgroundPosition: 'center',
        backgroundSize: 'cover',
      }}
    >
      <section
        className="w-full max-w-[560px] rounded-card border border-line bg-surface/95 p-8 text-foreground shadow-card backdrop-blur-md motion-safe:animate-[loading-rise_320ms_ease-out]"
        aria-label="Preparing your workspace"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <BrandLockup href="#top" size="md" />
          <span className="inline-flex items-center gap-2 rounded-full border border-line px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
            Secure session
          </span>
        </div>

        <div className="mt-8 flex items-center gap-2">
          <span className="h-px w-6 bg-brand" aria-hidden="true" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Field safety brief</span>
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">Preparing your workspace</h1>

        <p className="mt-3 flex items-center gap-2 text-sm text-muted" aria-live="polite">
          <Spinner size={16} fill="currentColor" className="text-brand" label="Loading workspace" />
          {canProceed ? 'Workspace ready' : 'Verifying organization access…'}
        </p>

        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Loading workspace">
          <span className="block h-full w-1/3 rounded-full bg-brand motion-safe:animate-[loading-sweep_1.6s_ease-in-out_infinite]" />
        </div>

        <ol className="mt-6 grid gap-2.5">
          {steps.map((step, index) => (
            <li key={step.label} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]',
                  step.done ? 'border-brand/40 bg-brand/15 text-brand' : step.active ? 'border-brand/40 text-brand' : 'border-line text-muted',
                )}
                aria-hidden="true"
              >
                {step.done ? <Icon name="check" size={12} /> : String(index + 1).padStart(2, '0')}
              </span>
              <span className={step.done || step.active ? 'text-foreground' : 'text-muted'}>{step.label}</span>
              {step.active && !step.done && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand motion-safe:animate-pulse motion-reduce:animate-none" aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>

        <p key={briefIndex} className="mt-7 min-h-6 text-sm text-muted motion-safe:animate-[brief-fade_400ms_ease-out]">
          “{SAFETY_BRIEFS[briefIndex]}”
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <small className="font-mono text-[11px] text-muted">
            {canProceed ? `Opening dashboard in ${secondsUntilAuto || 1}s` : 'Loading securely…'}
          </small>
          {canProceed && (
            <Button onClick={onProceed}>
              Proceed to dashboard <Icon name="arrowRight" size={15} />
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}