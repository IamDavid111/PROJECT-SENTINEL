import { cn } from '../../lib/utils'

export interface SpinnerProps {
  size?: number | string
  label?: string
  className?: string
  /** Fill colour for the spinner body. Defaults to white for use on brand/dark surfaces. */
  fill?: string
}

/**
 * Solid arc spinner. The default fill is white because spinners most often sit
 * on brand/dark buttons; pass `fill="currentColor"` for light surfaces.
 */
export function Spinner({ size = 20, label = 'Loading…', className, fill = '#fff' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className={cn('inline-flex', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className="animate-spin motion-reduce:animate-none"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 2a10 10 0 1 1-7.071 2.929L12 12Z" fill={fill} />
      </svg>
    </span>
  )
}

export function SpinnerCenter({
  label = 'Loading…',
  className,
  fill = '#fff',
}: {
  label?: string
  className?: string
  fill?: string
}) {
  return (
    <div className={cn('flex items-center justify-center p-8', className)} role="status" aria-label={label}>
      <Spinner size={24} fill={fill} />
    </div>
  )
}
