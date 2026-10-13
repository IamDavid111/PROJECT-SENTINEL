import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '../../lib/utils'
import { Icon, type IconProps } from './icon'

export type ToastTone = 'success' | 'info' | 'warning' | 'danger'

export interface Toast {
  id: number
  tone: ToastTone
  title: ReactNode
  description?: ReactNode
}

interface ToastContextValue {
  toast: (toast: Omit<Toast, 'id'> & { duration?: number }) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TOAST_ICONS: Record<ToastTone, IconProps['name']> = {
  success: 'success',
  info: 'info',
  warning: 'warning',
  danger: 'danger',
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const toast = useCallback<ToastContextValue['toast']>(
    (input) => {
      const id = nextId++
      setToasts((current) => [...current, { id, tone: input.tone, title: input.title, description: input.description }])
      const timer = setTimeout(() => dismiss(id), input.duration ?? 4000)
      timers.current.set(id, timer)
      return id
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-full max-w-sm flex-col gap-2" aria-live="polite">
          {toasts.map((item) => (
            <div
              key={item.id}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-card border bg-surface p-3.5 shadow-card',
                item.tone === 'success' && 'border-brand/25',
                item.tone === 'info' && 'border-line',
                item.tone === 'warning' && 'border-caution/30',
                item.tone === 'danger' && 'border-danger/25',
              )}
            >
              <Icon name={TOAST_ICONS[item.tone]} size={18} className="mt-0.5 shrink-0" />
              <div className="flex flex-1 flex-col gap-0.5">
                <strong className="text-sm font-semibold text-foreground">{item.title}</strong>
                {item.description && <div className="text-sm text-muted">{item.description}</div>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded-md p-1 text-muted transition-colors hover:bg-surface-soft hover:text-foreground"
                aria-label="Dismiss notification"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}