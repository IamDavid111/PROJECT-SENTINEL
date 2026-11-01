import { useEffect, useRef, type ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { buttonVariants } from './button'
import { Icon, type IconProps } from './icon'

export interface DropdownMenuItem {
  id: string
  label: ReactNode
  icon?: IconProps['name']
  tone?: 'default' | 'danger'
  disabled?: boolean
  onSelect?: () => void
}

export interface DropdownMenuProps {
  label: ReactNode
  items: DropdownMenuItem[]
  align?: 'start' | 'end'
  variant?: 'outline' | 'ghost' | 'default'
  size?: 'sm' | 'default'
  className?: string
}

/**
 * Lightweight action menu built on native `details`, so keyboard focus and
 * Escape work without a portal. Closes on select and on outside pointer-down.
 */
export function DropdownMenu({
  label,
  items,
  align = 'end',
  variant = 'outline',
  size = 'sm',
  className,
}: DropdownMenuProps) {
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const element = ref.current
      if (element?.open && !element.contains(event.target as Node)) element.open = false
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const element = ref.current
      if (event.key === 'Escape' && element?.open) {
        element.open = false
        element.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <details ref={ref} className={cn('relative inline-block', className)}>
      <summary
        className={cn(
          buttonVariants({ variant, size }),
          'cursor-pointer list-none [&::-webkit-details-marker]:hidden',
        )}
      >
        {label}
        <Icon name="chevronDown" size={14} />
      </summary>
      <div
        role="menu"
        className={cn(
          'absolute top-[calc(100%+6px)] z-40 grid min-w-52 gap-1 rounded-xl border border-line bg-surface p-1.5 shadow-card',
          align === 'end' ? 'right-0' : 'left-0',
        )}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect?.()
              if (ref.current) ref.current.open = false
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
              item.tone === 'danger' ? 'text-danger hover:bg-danger/10' : 'text-foreground hover:bg-surface-soft',
              item.disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {item.icon && <Icon name={item.icon} size={15} className="shrink-0" />}
            {item.label}
          </button>
        ))}
      </div>
    </details>
  )
}
