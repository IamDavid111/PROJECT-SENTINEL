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
    <div
      className={cn(
        'flex h-9 w-full items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-foreground transition-colors focus-within:border-brand',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <Icon name="search" size={16} className="shrink-0 text-muted" />
      <input
        type="search"
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  )
}
