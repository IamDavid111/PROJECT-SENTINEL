import type { ReactNode } from 'react'

import authIllustration from '../../assets/auth-illustration.jpg'
import { BrandLockup } from '../../components/brand/BrandLockup'
import { Icon } from '../../components/ui'
import { cn } from '../../lib/utils'

export interface AuthLayoutProps {
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  /** Optional content above the title, e.g. a step indicator. */
  step?: ReactNode
  /** Optional content below the form, e.g. security notes. */
  footer?: ReactNode
  backHref?: string
  backLabel?: string
  width?: 'md' | 'wide'
}

/**
 * Shared auth shell: fixed visual panel on the left, scrollable form panel on
 * the right. The illustration and access rail are the constant identity across
 * every auth screen.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  step,
  footer,
  backHref = '#top',
  backLabel = 'Back to home',
  width = 'md',
}: AuthLayoutProps) {
  return (
    <main className="min-h-screen bg-surface-soft text-foreground lg:grid lg:h-screen lg:grid-cols-[1.05fr_0.95fr] lg:overflow-hidden">
      <section className="relative hidden overflow-hidden bg-ink lg:flex lg:h-screen lg:flex-col lg:justify-end">
        <img
          src={authIllustration}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-left brightness-[0.6] contrast-125"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/20 via-transparent to-ink" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-ink via-ink/95 to-transparent" aria-hidden="true" />
        <div className="relative p-8 xl:p-10">
          <div className="max-w-sm">
            <BrandLockup href="#top" onDark size="md" className="mb-6" />
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Secure operations access
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-200">
              One workspace for field reporting, corrective actions and safety intelligence.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/15 pt-4 text-[11px] text-slate-300">
              {['Identity', 'Organization', 'Session'].map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-emerald-400" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative h-44 overflow-hidden bg-ink lg:hidden">
        <img src={authIllustration} alt="" className="absolute inset-0 h-full w-full object-cover object-left brightness-[0.6] contrast-125" />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/70 via-ink/30 to-surface-soft" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-between p-4">
          <BrandLockup href="#top" onDark size="sm" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">Secure operations access</p>
        </div>
      </section>

      <section className="relative flex justify-center px-4 py-10 sm:px-6 lg:h-screen lg:items-start lg:overflow-y-auto lg:px-10 lg:py-12">
        <div className={cn('w-full', width === 'wide' ? 'max-w-2xl' : 'max-w-md')}>
          <a
            href={backHref}
            className="mb-6 inline-flex h-9 w-fit items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Icon name="arrowLeft" size={15} /> {backLabel}
          </a>

          {step && <div className="mb-5">{step}</div>}

          <h1 className="text-balance font-display text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted">{subtitle}</p>}

          <div className="mt-6">{children}</div>

          {footer && <div className="mt-5">{footer}</div>}
        </div>
      </section>
    </main>
  )
}
