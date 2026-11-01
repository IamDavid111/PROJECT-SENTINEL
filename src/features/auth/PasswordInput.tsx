import { useState } from 'react'

import { Icon, Input, type InputProps } from '../../components/ui'
import { cn } from '../../lib/utils'

/** Password input with a show/hide control. */
export function PasswordInput({ className, ...props }: InputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-10', className)} />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <Icon name={visible ? 'viewOff' : 'eye'} size={15} />
      </button>
    </div>
  )
}
