import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'

export interface SidebarProps {
  brand: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

/** Dark workspace sidebar shell. Compose its contents with NavGroup/NavItem. */
export function Sidebar({ brand, children, footer, className }: SidebarProps) {
  return (
    <aside className={cn('flex min-h-full w-64 flex-col gap-6 overflow-y-auto bg-ink px-4 py-6 text-slate-300', className)}>
      <div className="min-w-0">{brand}</div>
      <nav aria-label="Workspace navigation" className="grid flex-1 content-start gap-5">
        {children}
      </nav>
      {footer && <div className="border-t border-white/10 pt-4">{footer}</div>}
    </aside>
  )
}
