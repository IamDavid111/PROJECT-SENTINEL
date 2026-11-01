import { cn } from '../../lib/utils'

export interface ProgressProps {
  value: number
  max?: number
  label?: string
  tone?: 'brand' | 'accent' | 'danger' | 'caution'
  className?: string
}

const TONE_CLASS: Record<NonNullable<ProgressProps['tone']>, string> = {
  brand: 'bg-brand',
  accent: 'bg-accent',
  danger: 'bg-danger',
  caution: 'bg-caution',
}

/** Determinate progress bar. `label` feeds the accessible name. */
export function Progress({ value, max = 100, label = 'Progress', tone = 'brand', className }: ProgressProps) {
  const clamped = Math.max(0, Math.min(value, max))
  const percent = max === 0 ? 0 : Math.round((clamped / max) * 100)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={clamped}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-line', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] motion-reduce:transition-none', TONE_CLASS[tone])}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
