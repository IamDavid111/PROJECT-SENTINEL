import type { ReactNode } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../../lib/utils'
import { Icon, type IconProps } from './icon'

const alertVariants = cva(
  'flex flex-col gap-1 rounded-card border px-4 py-3 text-sm',
  {
    variants: {
      tone: {
        success: 'border-brand/25 bg-brand/10 text-brand-dark',
        info: 'border-ink/20 bg-ink/5 text-ink-2',
        warning: 'border-caution/30 bg-caution/10 text-foreground',
        danger: 'border-danger/25 bg-danger/10 text-danger',
      },
    },
    defaultVariants: { tone: 'info' },
  },
)

const ALERT_ICONS: Record<NonNullable<VariantProps<typeof alertVariants>['tone']>, IconProps['name']> = {
  success: 'success',
  info: 'info',
  warning: 'warning',
  danger: 'danger',
}

export interface AlertProps extends VariantProps<typeof alertVariants> {
  tone?: NonNullable<VariantProps<typeof alertVariants>['tone']>
  /** Replaces the default tone icon. */
  icon?: IconProps['name']
  title?: ReactNode
  children?: ReactNode
  className?: string
}

/** Inline banner (success/info/warning/danger). Announced with role="alert". */
export function Alert({ tone = 'info', icon, title, children, className }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(alertVariants({ tone }), className)}
    >
      <div className="flex items-start gap-2.5">
        <Icon name={icon ?? ALERT_ICONS[tone]} size={18} className="mt-0.5 shrink-0" />
        <div className="flex flex-col gap-0.5">
          {title && <strong className="text-sm font-semibold">{title}</strong>}
          {children && <div className="text-sm opacity-90">{children}</div>}
        </div>
      </div>
    </div>
  )
}