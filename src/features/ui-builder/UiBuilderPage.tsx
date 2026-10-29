import { useEffect, useRef, useState } from 'react'

import { Badge, Button, Icon, IconButton, buttonVariants } from '../../components/ui'
import { cn } from '../../lib/utils'
import { ActionsSection } from './ActionsSection'
import { DataSection } from './DataSection'
import { DomainSection } from './DomainSection'
import { FeedbackSection } from './FeedbackSection'
import { FormsSection } from './FormsSection'
import { FoundationsSection } from './FoundationsSection'
import { MarketingSection } from './MarketingSection'
import { OverlaysSection } from './OverlaysSection'
import { ShellSection } from './ShellSection'

const SECTIONS = [
  { id: 'foundations', label: 'Foundations', eyebrow: '01' },
  { id: 'actions', label: 'Actions', eyebrow: '02' },
  { id: 'forms', label: 'Forms', eyebrow: '03' },
  { id: 'data', label: 'Data display', eyebrow: '04' },
  { id: 'feedback', label: 'Feedback', eyebrow: '05' },
  { id: 'overlays', label: 'Overlays', eyebrow: '06' },
  { id: 'patterns', label: 'Domain patterns', eyebrow: '07' },
  { id: 'marketing', label: 'Marketing', eyebrow: '08' },
  { id: 'shell', label: 'Navigation & shell', eyebrow: '09' },
]

export function UiBuilderPage({ isDarkMode, onToggleTheme }: { isDarkMode: boolean; onToggleTheme: () => void }) {
  const [activeId, setActiveId] = useState(SECTIONS[0].id)
  const themeApplied = useRef(false)
  const only = new URLSearchParams(window.location.search).get('only')
  const show = (id: string) => !only || only === id
  const navSections = only ? SECTIONS.filter((section) => section.id === only) : SECTIONS

  // Deep links for review: ?section=forms and ?theme=dark|light.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const section = query.get('section')
    if (section) {
      const frame = requestAnimationFrame(() => {
        document.getElementById(section)?.scrollIntoView({ block: 'start' })
      })
      return () => cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    if (themeApplied.current) return
    const requested = new URLSearchParams(window.location.search).get('theme')
    themeApplied.current = true
    if ((requested === 'dark' && !isDarkMode) || (requested === 'light' && isDarkMode)) onToggleTheme()
  }, [isDarkMode, onToggleTheme])

  useEffect(() => {
    const elements = SECTIONS.map((section) => document.getElementById(section.id)).filter((element): element is HTMLElement => Boolean(element))
    if (elements.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: [0, 1] },
    )
    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])

  return (
    <div className={cn('min-h-screen bg-surface text-foreground', isDarkMode && 'dark-theme')}>
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1560px] flex-wrap items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="#ui-builder" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm">
              <Icon name="administration" size={20} />
            </span>
            <span className="grid gap-0.5">
              <span className="font-display text-base font-semibold tracking-tight text-foreground">SentinelQHSE UI Builder</span>
              <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">Reusable component library</span>
            </span>
          </a>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Badge tone="success" className="hidden sm:inline-flex">58 primitives · live</Badge>
            <a
              href="#dashboard"
              className="hidden text-sm font-medium text-muted underline-offset-4 hover:text-foreground hover:underline sm:inline"
            >
              Open workspace
            </a>
            <IconButton
              icon={isDarkMode ? 'sun' : 'moon'}
              label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              variant="outline"
              onClick={onToggleTheme}
            />
          </div>
        </div>

        <nav aria-label="UI Builder sections" className="mx-auto flex w-full max-w-[1560px] gap-1 overflow-x-auto px-4 pb-2 sm:px-6 lg:hidden lg:px-8">
          {navSections.map((section) => (
            <a
              key={section.id}
              href={`#ui-builder`}
              onClick={(event) => {
                event.preventDefault()
                document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              aria-current={activeId === section.id ? 'true' : undefined}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                activeId === section.id
                  ? 'border-brand bg-brand/10 text-brand-dark'
                  : 'border-line text-muted hover:border-brand/40 hover:text-foreground',
              )}
            >
              {section.eyebrow} · {section.label}
            </a>
          ))}
        </nav>
      </header>

      <div className="mx-auto flex w-full max-w-[1560px] gap-10 px-4 py-8 sm:px-6 lg:px-8">
        <aside className="hidden w-56 shrink-0 lg:block">
          <nav aria-label="UI Builder sections" className="sticky top-24 grid gap-1">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Contents</p>
            {navSections.map((section) => (
              <a
                key={section.id}
                href={`#ui-builder`}
                onClick={(event) => {
                  event.preventDefault()
                  document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                aria-current={activeId === section.id ? 'true' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  activeId === section.id
                    ? 'bg-brand/10 font-semibold text-brand-dark'
                    : 'text-muted hover:bg-surface-soft hover:text-foreground',
                )}
              >
                <span className="font-mono text-[10px] text-muted">{section.eyebrow}</span>
                {section.label}
              </a>
            ))}
            <div className="mt-4 border-t border-line pt-4">
              <a
                href="#dashboard"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-soft hover:text-foreground"
              >
                <Icon name="arrowLeft" size={15} />
                Back to workspace
              </a>
              <a
                href="#top"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-soft hover:text-foreground"
              >
                <Icon name="externalLink" size={15} />
                Public site
              </a>
            </div>
          </nav>
        </aside>

        <main className="grid min-w-0 flex-1 gap-12">
          <section className="overflow-hidden rounded-card border border-line bg-ink text-white shadow-card">
            <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
              <div className="grid gap-3">
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand/40 bg-brand/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Component workbench
                </span>
                <h1 className="max-w-2xl font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                  Every primitive in one place, on the real tokens.
                </h1>
                <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
                  This page is the contract for the UI revamp. It renders the live components — not pictures — in light and
                  dark mode, with every variant and interactive state. Use it to review the library before pages are migrated.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button onClick={() => document.getElementById('foundations')?.scrollIntoView({ behavior: 'smooth' })}>
                    Start with tokens
                  </Button>
                  <a href="#dashboard" className={buttonVariants({ variant: 'inverse' })}>
                    Open workspace
                    <Icon name="arrowRight" size={15} />
                  </a>
                </div>
              </div>
              <dl className="grid grid-cols-3 gap-3 lg:grid-cols-1">
                {[
                  ['58', 'primitive files'],
                  ['9', 'sections'],
                  ['1', 'token source'],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</dt>
                    <dd className="font-display text-2xl font-semibold tabular-nums text-white">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {show('foundations') && <FoundationsSection />}
          {show('actions') && <ActionsSection />}
          {show('forms') && <FormsSection />}
          {show('data') && <DataSection />}
          {show('feedback') && <FeedbackSection />}
          {show('overlays') && <OverlaysSection />}
          {show('patterns') && <DomainSection />}
          {show('marketing') && <MarketingSection />}
          {show('shell') && <ShellSection />}

          <footer className="border-t border-line pt-8 text-sm text-muted">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                SentinelQHSE UI Builder · <span className="font-mono text-xs">#ui-builder</span>
              </span>
              <span>
                Token source: <span className="font-mono text-xs">src/index.css</span>
              </span>
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}
