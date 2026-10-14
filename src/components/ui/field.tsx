import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Label } from './label'

export interface FieldProps {
  label?: ReactNode
  /** id of the control this field labels. */
  htmlFor?: string
  required?: boolean
  hint?: ReactNode
  error?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Form row: label + control + hint/error. Error replaces hint when present and
 * is announced with role="alert". Keep the fieldset/grid concerns to the caller.
 */
export function Field({ label, htmlFor, required, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}