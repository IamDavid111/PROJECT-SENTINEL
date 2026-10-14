import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

export interface CheckboxProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  label?: ReactNode
  disabled?: boolean
  className?: string
}

/** Styled native checkbox (keeps keyboard + form semantics). */
export function Checkbox({ checked, onChange, label, disabled, className }: CheckboxProps) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer items-center gap-2',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        className="h-4 w-4 shrink-0 rounded border-line accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2"
      />
      {label && <span className="text-sm text-foreground">{label}</span>}
    </label>
  )
}