import { useEffect, useMemo, useRef, useState } from 'react'

import { cn } from '../../lib/utils'
import { Icon } from './icon'

export interface ComboboxOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

export interface ComboboxProps {
  options: readonly ComboboxOption[]
  value: string | null
  onChange: (value: string) => void
  label: string
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  id?: string
  className?: string
}

/**
 * Searchable select. The trigger is a button; the popover holds a filter input
 * and a listbox. Arrow keys move, Enter selects, Escape closes.
 */
export function Combobox({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search…',
  emptyMessage = 'No matches found.',
  disabled = false,
  id,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((option) => option.value === value) ?? null
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return options
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(normalized) ||
        (option.description ?? '').toLowerCase().includes(normalized),
    )
  }, [options, query])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  useEffect(() => {
    if (!open) return
    setQuery('')
    setHighlighted(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) close()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const select = (option: ComboboxOption) => {
    if (option.disabled) return
    onChange(option.value)
    close()
    triggerRef.current?.focus()
  }

  const activeIndex = Math.min(highlighted, Math.max(filtered.length - 1, 0))

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen(true)
          }
        }}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm transition-colors focus:border-brand focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span className={cn('min-w-0 truncate', selected ? 'text-foreground' : 'text-muted')}>
          {selected?.label ?? placeholder}
        </span>
        <Icon name="chevronDown" size={16} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          <div className="border-b border-line p-2">
            <div className="relative">
              <Icon name="search" size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded="true"
                aria-controls={`${id ?? 'combobox'}-listbox`}
                aria-autocomplete="list"
                aria-activedescendant={filtered[activeIndex] ? `${id ?? 'combobox'}-option-${filtered[activeIndex].value}` : undefined}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setHighlighted(0)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setHighlighted((index) => Math.min(filtered.length - 1, index + 1))
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault()
                    setHighlighted((index) => Math.max(0, index - 1))
                  } else if (event.key === 'Enter' && filtered[activeIndex]) {
                    event.preventDefault()
                    select(filtered[activeIndex])
                  } else if (event.key === 'Escape') {
                    event.preventDefault()
                    close()
                    triggerRef.current?.focus()
                  }
                }}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-lg border border-line bg-surface-soft pl-8 pr-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
              />
            </div>
          </div>
          <ul id={`${id ?? 'combobox'}-listbox`} role="listbox" aria-label={label} className="max-h-60 overflow-y-auto p-1.5">
            {filtered.length === 0 && <li className="px-3 py-3 text-sm text-muted">{emptyMessage}</li>}
            {filtered.map((option, index) => (
              <li key={option.value}>
                <button
                  type="button"
                  id={`${id ?? 'combobox'}-option-${option.value}`}
                  role="option"
                  aria-selected={option.value === value}
                  disabled={option.disabled}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => select(option)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors',
                    index === activeIndex && 'bg-brand/10',
                    option.value === value && 'font-medium',
                    option.disabled && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm text-foreground">{option.label}</span>
                    {option.description && <span className="truncate text-xs text-muted">{option.description}</span>}
                  </span>
                  {option.value === value && <Icon name="check" size={14} className="mt-1 shrink-0 text-brand" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
