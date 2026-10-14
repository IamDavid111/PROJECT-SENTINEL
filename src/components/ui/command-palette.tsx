import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '../../lib/utils'
import { Icon, type IconProps } from './icon'

export interface CommandItem {
  id: string
  label: string
  /** Small monospace hint, e.g. the route. */
  hint?: string
  icon?: IconProps['name']
  onSelect: () => void
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: CommandItem[]
  placeholder?: string
}

/**
 * Lightweight command palette ("⌘K" search). Keyboard-driven: ↑/↓ to move,
 * Enter to run, Esc to close, with scrolling results. Replaces the previously
 * inert global search box.
 */
export function CommandPalette({ open, onOpenChange, items, placeholder = 'Type to search…' }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setHighlighted(0)
    // Focus after the portal paints; the browser defers to the next frame.
    requestAnimationFrame(() => inputRef.current?.focus())
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  const normalized = query.trim().toLowerCase()
  const filtered = normalized
    ? items.filter((item) => item.label.toLowerCase().includes(normalized) || (item.hint ?? '').toLowerCase().includes(normalized))
    : items
  const activeIndex = Math.min(highlighted, Math.max(filtered.length - 1, 0))

  const run = (item: CommandItem) => {
    onOpenChange(false)
    item.onSelect()
  }

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" aria-hidden="true" onMouseDown={() => onOpenChange(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search workspace"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onOpenChange(false)
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            setHighlighted((index) => Math.min(filtered.length - 1, index + 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setHighlighted((index) => Math.max(0, index - 1))
          } else if (event.key === 'Enter' && filtered[activeIndex]) {
            event.preventDefault()
            run(filtered[activeIndex])
          }
        }}
        className="relative w-full max-w-lg overflow-hidden rounded-card border border-line bg-surface shadow-card"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Icon name="search" size={16} className="shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label="Search workspace"
            className="h-12 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted focus-visible:outline-none"
          />
          <span className="text-xs text-muted">esc</span>
        </div>
        <ul role="listbox" aria-label="Results" className="max-h-72 overflow-y-auto p-2">
          {filtered.length === 0 && <li className="px-3 py-4 text-sm text-muted">No results for “{query}”.</li>}
          {filtered.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => run(item)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                  index === activeIndex ? 'bg-brand/10 text-foreground' : 'text-foreground',
                )}
              >
                {item.icon && <Icon name={item.icon} size={16} className="shrink-0 text-muted" />}
                <span className="flex-1">{item.label}</span>
                {item.hint && <span className="font-mono text-xs text-muted">{item.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  )
}