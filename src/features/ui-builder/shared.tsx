import { useState, type ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Icon, PageHeader } from '../../components/ui'

export function Section({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 border-t border-line pt-12 first:border-0 first:pt-0">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        titleId={`${id}-title`}
        headingLevel="h2"
        description={description}
      />
      <div className="mt-7 grid gap-5">{children}</div>
    </section>
  )
}

/**
 * A specimen frame: title + optional usage note, then the live component on a
 * neutral surface so borders/shadows read honestly.
 */
export function Demo({
  title,
  description,
  children,
  className,
  contentClassName,
  importName,
}: {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  /** If provided, renders a copyable `import { X } from '@/components/ui'` chip. */
  importName?: string
}) {
  const [copied, setCopied] = useState(false)
  const snippet = importName ? `import { ${importName} } from '@/components/ui'` : ''

  const copy = async () => {
    if (!snippet) return
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={cn('rounded-card border border-line bg-surface', className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-5 py-3.5">
        <div className="grid gap-0.5">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
        {snippet && (
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={`Copy import for ${importName}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-soft px-2.5 py-1 font-mono text-[11px] text-muted transition-colors hover:border-brand/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <Icon name={copied ? 'check' : 'copy'} size={12} />
            {copied ? 'Copied' : importName}
          </button>
        )}
      </div>
      <div className={cn('p-5', contentClassName)}>{children}</div>
    </div>
  )
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-3', className)}>{children}</div>
}

export function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid content-start gap-3', className)}>{children}</div>
}

export function ColumnGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3', className)}>{children}</div>
}

export function Swatch({ name, value, role }: { name: string; value: string; role: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="h-16 w-full" style={{ backgroundColor: value }} />
      <div className="grid gap-0.5 bg-surface px-3 py-2">
        <span className="text-xs font-semibold text-foreground">{name}</span>
        <code className="font-mono text-[11px] text-muted">{value}</code>
        <span className="text-[11px] text-muted">{role}</span>
      </div>
    </div>
  )
}

export function TypeSpec({
  label,
  sample,
  className,
}: {
  label: string
  sample: string
  className?: string
}) {
  return (
    <div className="grid gap-1 border-b border-line pb-3 last:border-0 last:pb-0">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{label}</span>
      <span className={className}>{sample}</span>
    </div>
  )
}
