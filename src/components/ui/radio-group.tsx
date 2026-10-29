import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

export interface RadioOption {
  value: string
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}

export interface RadioGroupProps {
  name: string
  options: RadioOption[]
  value: string
  onChange: (value: string) => void
  label: string
  /** `card` renders large selectable tiles (used by incident type / sign-in type). */
  variant?: 'default' | 'card'
  className?: string
}

/** Native radios, styled as either a compact list or selectable cards. */
export function RadioGroup({ name, options, value, onChange, label, variant = 'default', className }: RadioGroupProps) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid content-start gap-2', className)}>
      {options.map((option) => {
        const selected = option.value === value
        if (variant === 'card') {
          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
                selected ? 'border-brand bg-brand/5 ring-2 ring-brand/15' : 'border-line bg-surface hover:border-brand/40',
                option.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                disabled={option.disabled}
                onChange={() => onChange(option.value)}
                className="mt-1 h-4 w-4 shrink-0 accent-brand"
              />
              <span className="grid min-w-0 gap-1">
                <span className="text-sm font-semibold text-foreground">{option.label}</span>
                {option.description && <span className="text-xs text-muted">{option.description}</span>}
              </span>
            </label>
          )
        }
        return (
          <label key={option.value} className={cn('inline-flex items-center gap-2', option.disabled && 'opacity-50')}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={selected}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
              className="h-4 w-4 accent-brand"
            />
            <span className="text-sm text-foreground">{option.label}</span>
          </label>
        )
      })}
    </div>
  )
}
