import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Icon, type IconProps } from './icon'

export interface NavItemProps {
  label: ReactNode
  icon?: IconProps['name']
  href?: string
  active?: boolean
  onClick?: () => void
  badge?: ReactNode
  className?: string
}

const NAV_ITEM_CLASS =
  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50'

/** Sidebar navigation item. Renders an anchor when `href` is provided. */
export function NavItem({ label, icon, href, active, onClick, badge, className }: NavItemProps) {
  const content = (
    <>
      {icon && (
        <span className={cn('flex shrink-0 items-center', active ? 'text-white' : 'text-brand/90')}>
          <Icon name={icon} size={16} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge && <span className="shrink-0">{badge}</span>}
    </>
  )

  const classes = cn(
    NAV_ITEM_CLASS,
    active ? 'bg-brand text-white shadow-sm' : 'text-slate-400 hover:bg-white/8 hover:text-white',
    className,
  )

  if (href) {
    return (
      <a href={href} aria-current={active ? 'page' : undefined} className={classes} onClick={onClick}>
        {content}
      </a>
    )
  }

  return (
    <button type="button" aria-current={active ? 'page' : undefined} className={classes} onClick={onClick}>
      {content}
    </button>
  )
}

export interface NavGroupProps {
  title: ReactNode
  children: ReactNode
  className?: string
}

/** Labeled group of sidebar items. */
export function NavGroup({ title, children, className }: NavGroupProps) {
  return (
    <div className={cn('grid gap-1', className)}>
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      {children}
    </div>
  )
}
