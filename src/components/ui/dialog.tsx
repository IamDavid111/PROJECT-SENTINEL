import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '../../lib/utils'
import { IconButton } from './icon-button'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** Close on Esc (default true). */
  closeOnEscape?: boolean
  /** Close on backdrop click (default true). */
  closeOnBackdrop?: boolean
  className?: string
}

/**
 * Accessible modal: focus moves into the panel, Esc closes, focus returns to
 * the trigger, and the body scroll is locked while open. Minimal and dependency
 * free — a full focus trap can be layered on later if a flow needs one.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeOnEscape = true,
  closeOnBackdrop = true,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement as HTMLElement | null
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const panel = panelRef.current
    // Move focus into the dialog and keep Esc handling attached.
    const focusTarget = panel?.querySelector<HTMLElement>('[data-autofocus], button')
    focusTarget?.focus()
    return () => {
      document.body.style.overflow = previous
      restoreFocusRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
        aria-hidden="true"
        onMouseDown={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? 'dialog-description' : undefined}
        onKeyDown={(event) => {
          if (closeOnEscape && event.key === 'Escape') onClose()
        }}
        className={cn(
          'relative w-full max-w-lg rounded-card border border-line bg-surface p-6 shadow-card sm:max-h-[85vh] sm:overflow-y-auto',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="dialog-title" className="font-display text-lg font-semibold text-foreground">
              {title}
            </h2>
            {description && (
              <p id="dialog-description" className="text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton icon="close" label="Close dialog" variant="ghost" onClick={onClose} />
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}