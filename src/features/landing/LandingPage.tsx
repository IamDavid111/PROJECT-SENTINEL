import { useState } from 'react'

import customerBenefitsDashboard from '../../assets/benefits-dashboard.png'
import heroFacility from '../../assets/hero-facility.jpg'
import { BrandLockup } from '../../components/brand/BrandLockup'
import { Icon, IconButton, buttonVariants } from '../../components/ui'
import type { IconName } from '../../lib/icons'
import { cn } from '../../lib/utils'

const NAV = [
  { label: 'Platform', href: '#platform' },
  { label: 'Industries', href: '#industries' },
  { label: 'Outcomes', href: '#outcomes' },
  { label: 'Product', href: '#product' },
]

const METRICS = [
  { value: '48%', label: 'reduction in recordable incidents', detail: 'within four quarters' },
  { value: '3.1x', label: 'increase in near-miss reporting', detail: 'from frontline crews' },
  { value: '62%', label: 'faster corrective action closure', detail: 'across operating teams' },
  { value: '100%', label: 'auditable trail', detail: 'for regulator and client assurance' },
]

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'camera', title: 'Digital incident reporting', text: 'Capture near misses to fatalities in the field with GPS, photo, video and voice evidence — online or offline.' },
  { icon: 'inspections', title: 'Inspections & audits', text: 'Digital inspection types, custom templates, pass/fail checklists and audit programmes with a live calendar.' },
  { icon: 'correctiveActions', title: 'Corrective action control', text: 'Every finding becomes a tracked action with owners, due dates, evidence and verification sign-off.' },
  { icon: 'waypoints', title: 'Predictive risk intelligence', text: 'Risk scores per facility using historical incidents, observations and operating context.' },
  { icon: 'aiAssistant', title: 'AI safety copilot', text: 'Ask plain-language questions about your safety data and get summaries, charts and recommendations.' },
  { icon: 'administration', title: 'Enterprise governance', text: 'Multi-tenant organisations, granular roles, full activity logging and exportable audit trails.' },
]

const BENEFITS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'smartphone', title: 'Frontline adoption', text: 'Glove-friendly mobile reporting with offline sync means events get captured when they happen.' },
  { icon: 'trendingUp', title: 'Executive visibility', text: 'A single safety score, trend and forecast per site, department and contractor.' },
  { icon: 'fileDownload', title: 'Assurance on demand', text: 'Generate inspection, audit and corrective action reports as PDF or Excel in seconds.' },
]

const INDUSTRIES: { icon: IconName; label: string }[] = [
  { icon: 'factory', label: 'Upstream E&P' },
  { icon: 'ship', label: 'Offshore & Marine' },
  { icon: 'oilBarrel', label: 'Refining & Petrochemical' },
  { icon: 'waypoints', label: 'Pipelines & Terminals' },
  { icon: 'drill', label: 'Drilling Operations' },
  { icon: 'fuel', label: 'Energy Services' },
]

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2">
        <span className="h-px w-6 bg-brand" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{eyebrow}</span>
      </div>
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h2>
      <p className="mt-3 text-base leading-relaxed text-muted">{description}</p>
    </div>
  )
}

export function LandingPage({ isDarkMode, onToggleTheme }: { isDarkMode: boolean; onToggleTheme: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className={cn('min-h-screen bg-surface text-foreground', isDarkMode && 'dark-theme')}>
      <header className="sticky top-0 z-50 border-b border-line bg-surface/90 backdrop-blur">
        <div className="relative mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <BrandLockup href="#top" size="md" />

          <nav aria-label="Primary navigation" className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-7 lg:flex">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="text-sm font-medium text-muted transition-colors hover:text-foreground">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-1.5">
            <IconButton
              icon={isDarkMode ? 'sun' : 'moon'}
              label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              variant="ghost"
              onClick={onToggleTheme}
            />
            <a href="#sign-in" className="hidden h-9 items-center px-3 text-sm font-medium text-muted transition-colors hover:text-foreground sm:inline-flex">
              Sign in
            </a>
            <a href="#demo" className={cn(buttonVariants(), 'hidden sm:inline-flex')}>
              Request demo
            </a>
            <IconButton
              className="lg:hidden"
              icon={mobileOpen ? 'close' : 'menu'}
              label={mobileOpen ? 'Close navigation' : 'Open navigation'}
              variant="ghost"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen((open) => !open)}
            />
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-line bg-surface lg:hidden">
            <nav aria-label="Mobile navigation" className="mx-auto grid max-w-7xl gap-1 px-4 py-4 sm:px-6">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-soft hover:text-foreground"
                >
                  {item.label}
                </a>
              ))}
              <div className="mt-3 grid gap-2 border-t border-line pt-3">
                <a href="#register" onClick={() => setMobileOpen(false)} className={buttonVariants({ variant: 'outline' })}>
                  Create account
                </a>
                <a href="#sign-in" onClick={() => setMobileOpen(false)} className={buttonVariants({ variant: 'secondary' })}>
                  Sign in
                </a>
                <a href="#demo" onClick={() => setMobileOpen(false)} className={buttonVariants()}>
                  Request demo
                </a>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main id="top">
        <section className="relative isolate bg-ink text-white">
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            <img src={heroFacility} alt="" className="absolute inset-0 h-full w-full object-cover object-center brightness-[0.7]" />
            <div className="absolute inset-0 bg-ink/50" />
            <div className="absolute inset-0 bg-gradient-to-r from-ink/95 via-ink/85 to-ink/45" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(to bottom, transparent 78%, var(--color-surface) 100%)' }}
            />
          </div>

          <div className="relative mx-auto w-full max-w-7xl px-4 pb-32 pt-16 sm:px-6 sm:pb-52 lg:px-8 lg:pb-84 lg:pt-24 xl:pb-96">
            <div className="mx-auto max-w-4xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                AI-powered operational safety intelligence
              </span>
              <h1 className="mx-auto mt-6 max-w-4xl text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                From reactive incident reports to predictive safety intelligence.
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-slate-300 sm:text-lg">
                SentinelQHSE helps energy companies capture every event in the field, close every corrective action,
                and forecast where the next incident is most likely to happen.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                <a href="#demo" className={buttonVariants()}>
                  Request demo
                  <Icon name="arrowRight" size={15} />
                </a>
                <a href="#sign-in" className={buttonVariants({ variant: 'inverse' })}>
                  Sign in
                </a>
                <a href="#demo" className="inline-flex h-9 items-center px-2 text-sm font-medium text-slate-300 transition-colors hover:text-white">
                  Contact sales
                </a>
              </div>

              <dl className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-5 border-t border-white/10 pt-6 text-center sm:grid-cols-4">
                {METRICS.map((metric) => (
                  <div key={metric.value}>
                    <dt className="sr-only">{metric.label}</dt>
                    <dd>
                      <span className="block font-display text-2xl font-semibold tabular-nums text-white">{metric.value}</span>
                      <span className="mt-1 block text-xs leading-snug text-slate-300">{metric.label}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">{metric.detail}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

          </div>
        </section>

        <div className="relative z-10 mx-auto -mt-32 w-full max-w-6xl px-4 sm:-mt-52 sm:px-6 lg:-mt-84 lg:px-8 xl:-mt-96">
          <div className="pointer-events-none absolute -inset-x-8 -bottom-12 top-10 rounded-[48px] bg-brand/40 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute inset-x-16 -bottom-8 top-16 rounded-[40px] bg-brand/25 blur-2xl" aria-hidden="true" />
          <div className="relative overflow-hidden rounded-card border border-white/10 bg-ink/80 p-2 shadow-[0_40px_120px_-30px_rgba(18,169,79,0.55)] backdrop-blur">
            <div className="flex items-center gap-1.5 px-2 pb-2" aria-hidden="true">
              <span className="h-2 w-2 rounded-full bg-white/20" />
              <span className="h-2 w-2 rounded-full bg-white/20" />
              <span className="h-2 w-2 rounded-full bg-white/20" />
              <span className="ml-3 h-4 flex-1 rounded bg-white/5" />
            </div>
            <img
              src={customerBenefitsDashboard}
              alt="SentinelQHSE operational safety dashboard"
              className="w-full rounded-xl border border-white/10"
              fetchPriority="high"
            />
          </div>
        </div>

        <section id="platform" className="border-b border-line bg-surface pb-20 pt-16 sm:pt-24 lg:pt-40 xl:pt-44">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionIntro
              eyebrow="Platform"
              title="One operating system for QHSE performance"
              description="Built to the workflows international oil and gas operators already run — and to the standards their regulators and clients audit against."
            />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <article key={feature.title} className="group grid gap-4 rounded-card border border-line bg-surface p-6 transition-colors hover:border-brand/40">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
                    <Icon name={feature.icon} size={20} />
                  </span>
                  <div className="grid gap-2">
                    <h3 className="font-display text-lg font-semibold text-foreground">{feature.title}</h3>
                    <p className="text-sm leading-relaxed text-muted">{feature.text}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="industries" className="border-b border-line bg-surface-soft py-16">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionIntro
              eyebrow="Industries"
              title="Built for the field, from wellhead to terminal"
              description="The same operating model scales across upstream, midstream, refining and energy services."
            />
            <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {INDUSTRIES.map((industry) => (
                <div key={industry.label} className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-4 text-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <Icon name={industry.icon} size={18} />
                  </span>
                  <strong className="text-sm font-medium leading-snug text-foreground">{industry.label}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="outcomes" className="bg-surface py-20">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionIntro
              eyebrow="Customer benefits"
              title="Safety leaders get answers, not archives"
              description="Turn every report, inspection and action into a current operating picture."
            />
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {BENEFITS.map((benefit) => (
                <article key={benefit.title} className="rounded-card border border-line bg-surface p-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Icon name={benefit.icon} size={19} />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-semibold text-foreground">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{benefit.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="product" className="border-t border-line bg-surface-soft py-20">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionIntro
              eyebrow="Product"
              title="What teams say after the first quarter"
              description="A sample of the operational feedback that shaped the platform."
            />
            <div className="mt-9 grid gap-4 lg:grid-cols-2">
              {[
                {
                  quote: 'We stopped chasing spreadsheets. Every finding now has an owner, a due date and evidence attached to it before it closes.',
                  name: 'HSE Director',
                  org: 'West African upstream operator (placeholder)',
                },
                {
                  quote: 'The risk forecast flagged heat stress at our flow station a week before we would have noticed the pattern ourselves.',
                  name: 'Operations Manager',
                  org: 'Gas processing joint venture (placeholder)',
                },
              ].map((item) => (
                <blockquote key={item.name} className="rounded-card border border-line bg-surface p-6">
                  <p className="text-base leading-relaxed text-foreground">“{item.quote}”</p>
                  <footer className="mt-5 grid gap-0.5">
                    <strong className="text-sm font-semibold text-foreground">{item.name}</strong>
                    <span className="text-xs text-muted">{item.org}</span>
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-surface py-16">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-wrap items-center justify-between gap-6 rounded-card border border-brand/20 bg-brand px-6 py-8 text-white sm:px-10">
              <div className="max-w-2xl">
                <h2 className="font-display text-2xl font-semibold tracking-tight">Ready to see it on your data?</h2>
                <p className="mt-1 text-sm text-white/80">
                  Bring one site, one department or one operating unit. We will map the first workflow with your team.
                </p>
              </div>
              <a href="#demo" className={buttonVariants({ variant: 'reverse' })}>
                Request demo
                <Icon name="arrowRight" size={15} />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer id="contact" className="border-t border-white/10 bg-ink text-slate-300">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:px-8">
          <div className="grid content-start gap-4">
            <BrandLockup href="#top" onDark size="md" />
            <p className="max-w-sm text-sm leading-relaxed text-slate-400">
              AI-powered operational safety intelligence for the energy industry.
            </p>
            <a href="#demo" className="inline-flex h-9 w-fit items-center gap-2 rounded-xl border border-white/20 px-3 text-sm font-medium text-white transition-colors hover:bg-white/10">
              Contact sales
              <Icon name="arrowRight" size={14} />
            </a>
          </div>
          <div className="grid content-start gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Platform</h3>
            <a href="#sign-in" className="text-sm text-slate-400 hover:text-white">Dashboard</a>
            <a href="#sign-in" className="text-sm text-slate-400 hover:text-white">Incidents</a>
            <a href="#sign-in" className="text-sm text-slate-400 hover:text-white">Audits</a>
          </div>
          <div className="grid content-start gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Company</h3>
            <a href="#demo" className="text-sm text-slate-400 hover:text-white">Contact sales</a>
            <a href="#register" className="text-sm text-slate-400 hover:text-white">Register organization</a>
          </div>
          <div className="grid content-start gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Access</h3>
            <a href="#sign-in" className="text-sm text-slate-400 hover:text-white">Sign in</a>
            <a href="#forgot-password" className="text-sm text-slate-400 hover:text-white">Forgot password</a>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-slate-500 sm:px-6 lg:px-8">
            <span>© 2026 SentinelQHSE™. All rights reserved.</span>
            <span>Safety intelligence for every shift, site and decision.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
