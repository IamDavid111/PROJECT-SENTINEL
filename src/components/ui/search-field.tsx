import { cn } from '../../lib/utils'
import { Icon } from './icon'

export interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  disabled?: boolean
  className?: string
}

/** Search input with leading icon and clear affordance. */
export function SearchField({
  value,
  onChange,
  placeholder = 'Search…',
  label = 'Search',
  disabled = false,
  className,
}: SearchFieldProps) {
  return (
    <div className={cn('relative w-full', className)}>
      <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-xl border border-line bg-surface pl-9 pr-9 text-sm text-foreground placeholder:text-muted transition-colors focus:border-brand focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  )
}
