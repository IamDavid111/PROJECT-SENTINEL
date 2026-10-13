import type { CSSProperties, HTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'line' | 'circle'
  style?: CSSProperties
}

/** Loading placeholder. Pulse is available but respects reduced motion. */
export function Skeleton({ variant = 'line', className, style, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-line motion-reduce:animate-none',
        variant === 'text' && 'h-3 rounded-md',
        variant === 'line' && 'h-10 rounded-xl',
        variant === 'circle' && 'rounded-full',
        className,
      )}
      style={style}
      {...props}
    />
  )
}