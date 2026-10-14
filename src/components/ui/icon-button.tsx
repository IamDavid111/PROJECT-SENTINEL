import * as React from 'react'

import { cn } from '../../lib/utils'
import { Button } from './button'
import { Icon, type IconProps } from './icon'

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Registry icon key (see src/lib/icons.ts). */
  icon: IconProps['name']
  /** Accessible name shown for screen readers and hover tooltip. */
  label: string
  variant?: 'default' | 'ghost' | 'outline'
  size?: number | string
  loading?: boolean
}

/**
 * Icon-only action button. The label is required: it feeds the tooltip and the
 * accessible name, so icon-only controls stay understandable to everyone.
 */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 18,
  loading = false,
  className,
  title,
  ...props
}: IconButtonProps) {
  return (
    <Button
      {...props}
      variant={variant}
      size="icon"
      loading={loading}
      title={title ?? label}
      aria-label={label}
      className={cn(className)}
    >
      <Icon name={icon} size={size} />
    </Button>
  )
}