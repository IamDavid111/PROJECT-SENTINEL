import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Checkbox } from './checkbox'

export interface PermissionItem {
  key: string
  label: ReactNode
  description?: ReactNode
  required?: boolean
}

export interface PermissionGroup {
  id: string
  label: ReactNode
  items: readonly PermissionItem[]
}

export interface PermissionMatrixProps {
  groups: readonly PermissionGroup[]
  value: readonly string[]
  onChange: (value: string[]) => void
  disabled?: boolean
  className?: string
}

/**
 * Grouped permission tiles with a select-all control. Required baseline
 * permissions stay checked and disabled — they cannot be removed.
 */
export function PermissionMatrix({ groups, value, onChange, disabled = false, className }: PermissionMatrixProps) {
  const allKeys = groups.flatMap((group) => group.items.map((item) => item.key))
  const editableKeys = groups.flatMap((group) => group.items.filter((item) => !item.required).map((item) => item.key))
  const allSelected = allKeys.every((key) => value.includes(key))

  const toggle = (key: string, checked: boolean) => {
    if (checked) {
      if (!value.includes(key)) onChange([...value, key])
    } else {
      onChange(value.filter((item) => item !== key))
    }
  }

  const selectAll = (checked: boolean) => {
    if (checked) onChange(allKeys)
    else onChange(value.filter((key) => groups.some((group) => group.items.some((item) => item.key === key && item.required))))
  }

  return (
    <div className={cn('grid gap-4', className)}>
      <Checkbox
        checked={allSelected}
        onChange={selectAll}
        disabled={disabled}
        label="Select all permissions"
        className="w-full rounded-xl border border-line bg-surface-soft px-3 py-2"
      />
      {groups.map((group) => (
        <section key={group.id} className="grid gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{group.label}</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.items.map((item) => (
              <Checkbox
                key={item.key}
                checked={value.includes(item.key)}
                disabled={disabled || item.required}
                onChange={(checked) => toggle(item.key, checked)}
                className={cn(
                  'items-start rounded-xl border p-3',
                  item.required ? 'border-brand/25 bg-brand/5' : 'border-line bg-surface',
                )}
                label={
                  <span className="grid gap-0.5">
                    <span className="text-xs font-semibold text-foreground">
                      {item.label}
                      {item.required ? ' · Required' : ''}
                    </span>
                    {item.description && <span className="text-[11px] text-muted">{item.description}</span>}
                  </span>
                }
              />
            ))}
          </div>
        </section>
      ))}
      <p className="text-[11px] text-muted">
        {editableKeys.filter((key) => value.includes(key)).length} of {editableKeys.length} optional permissions granted.
      </p>
    </div>
  )
}
