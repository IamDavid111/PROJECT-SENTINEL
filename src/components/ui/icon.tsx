import { Icon as IconifyIcon, iconLoaded } from '@iconify/react'

import { cn } from '../../lib/utils'
import { ICONS, type IconName } from '../../lib/icons'

export interface IconProps {
  /** Semantic icon key — must exist in src/lib/icons.ts. */
  name: IconName
  /** Width/height in px (or any CSS length string). */
  size?: number | string
  className?: string
  /** Optional color override; defaults to `currentColor` from CSS. */
  color?: string
  /** Icons are decorative by default; pass a label + `aria-hidden={false}` for meaningful icons. */
  'aria-hidden'?: boolean | 'true' | 'false'
}

/**
 * The single icon renderer in the app. Backed by the local HugeIcons set
 * (see src/lib/icons.ts), so no network request can ever happen. In dev, an
 * unrecognized name warns loudly instead of silently hitting the Iconify API.
 */
export function Icon({ name, size = 20, className, color, 'aria-hidden': ariaHidden = true }: IconProps) {
  const resolved = ICONS[name]

  if (import.meta.env.DEV && !iconLoaded(resolved)) {
    console.warn(`[icons] "${name}" (${resolved}) is not available in the local HugeIcons set. Check src/lib/icons.ts.`)
  }

  return (
    <IconifyIcon
      icon={resolved}
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      style={color ? { color } : undefined}
      aria-hidden={ariaHidden}
    />
  )
}