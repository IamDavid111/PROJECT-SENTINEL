import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Icon } from './icon'

export interface StepperStep {
  id: string
  label: ReactNode
  description?: ReactNode
}

export interface StepperProps {
  steps: StepperStep[]
  activeIndex: number
  onStepClick?: (index: number) => void
  /** Allow jumping to completed steps only. Default true. */
  allowBacktrack?: boolean
  className?: string
}

/**
 * Wizard progress: bar + numbered stage buttons. Clicking a stage only moves
 * backwards unless the caller decides otherwise.
 */
export function Stepper({ steps, activeIndex, onStepClick, allowBacktrack = true, className }: StepperProps) {
  const percent = steps.length === 0 ? 0 : ((activeIndex + 1) / steps.length) * 100
  return (
    <div className={cn('grid gap-3', className)}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-brand transition-[width] motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((step, index) => {
          const active = index === activeIndex
          const complete = index < activeIndex
          const reachable = Boolean(onStepClick) && (allowBacktrack ? index <= activeIndex : active)
          return (
            <button
              key={step.id}
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onStepClick?.(index)}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                active && 'border-brand bg-brand/10 text-brand-dark',
                complete && 'border-brand/30 text-foreground',
                !active && !complete && 'border-line text-muted',
                reachable ? 'cursor-pointer hover:border-brand' : 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold',
                  active ? 'bg-brand text-white' : complete ? 'bg-brand/15 text-brand-dark' : 'bg-surface-soft text-muted',
                )}
              >
                {complete ? <Icon name="check" size={12} /> : index + 1}
              </span>
              {step.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
