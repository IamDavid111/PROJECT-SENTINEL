import { cn } from '../../lib/utils'
import { Icon } from './icon'

export interface SpinnerProps {
  size?: number | string
  label?: string
  className?: string
}

/** Inline loading spinner; announces `label` (default "Loading…") to screen readers. */
export function Spinner({ size = 20, label = 'Loading…', className }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex', className)}>
      <Icon name="spinner" size={size} className="animate-spin motion-reduce:animate-none" />
    </span>
  )
}

export function SpinnerCenter({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center p-8', className)} role="status" aria-label={label}>
      <Spinner size={24} />
    </div>
  )
}