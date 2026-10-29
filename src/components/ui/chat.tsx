import type { ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Icon } from './icon'
import { IconButton } from './icon-button'
import { Textarea } from './textarea'

export interface ChatBubbleProps {
  role: 'user' | 'assistant'
  author?: ReactNode
  avatar?: ReactNode
  meta?: ReactNode
  children: ReactNode
  className?: string
}

/** Conversation bubble: assistant left, user right. */
export function ChatBubble({ role, author, avatar, meta, children, className }: ChatBubbleProps) {
  const user = role === 'user'
  return (
    <div className={cn('flex items-start gap-2', user ? 'justify-end' : 'justify-start', className)}>
      {!user && avatar && <span className="shrink-0">{avatar}</span>}
      <div className={cn('grid min-w-0 gap-1', user ? 'max-w-[78%] items-end' : 'max-w-[82%]')}>
        {author && <span className="text-[11px] font-semibold text-muted">{author}</span>}
        <div
          className={cn(
            'rounded-xl px-3 py-2 text-sm leading-relaxed',
            user ? 'rounded-tr-sm bg-brand text-white' : 'rounded-tl-sm border border-line bg-surface text-foreground',
          )}
        >
          {children}
        </div>
        {meta && <span className="text-[11px] text-muted">{meta}</span>}
      </div>
      {user && avatar && <span className="shrink-0">{avatar}</span>}
    </div>
  )
}

export interface ChatComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  placeholder?: string
  maxLength?: number
  disabled?: boolean
  footnote?: ReactNode
  className?: string
}

/** Character-counted composer with a send icon button. Enter sends, Shift+Enter adds a line. */
export function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder = 'Ask a question…',
  maxLength = 4000,
  disabled = false,
  footnote,
  className,
}: ChatComposerProps) {
  const canSend = !disabled && value.trim().length > 0

  return (
    <form
      className={cn('grid gap-1.5', className)}
      onSubmit={(event) => {
        event.preventDefault()
        if (canSend) onSend()
      }}
    >
      <div className="flex items-end gap-2">
        <Textarea
          rows={2}
          value={value}
          maxLength={maxLength}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (canSend) onSend()
            }
          }}
          className="min-h-16"
        />
        <IconButton icon="arrowRight" label="Send question" variant="default" disabled={!canSend} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>{footnote}</span>
        <span className="font-mono">{value.length}/{maxLength}</span>
      </div>
    </form>
  )
}

export interface ChatMessageListProps {
  children: ReactNode
  busy?: boolean
  busyLabel?: string
  className?: string
}

/** Scrollable conversation body with an optional processing line. */
export function ChatMessageList({ children, busy = false, busyLabel = 'Processing your request…', className }: ChatMessageListProps) {
  return (
    <div className={cn('grid gap-3 overflow-y-auto rounded-xl border border-line bg-surface-soft p-3', className)}>
      {children}
      {busy && (
        <p className="flex items-center gap-2 text-xs text-muted" role="status">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand motion-reduce:animate-none" />
          {busyLabel}
        </p>
      )}
    </div>
  )
}

export interface PromptChipProps {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}

export function PromptChip({ children, onClick, disabled }: PromptChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted transition-colors hover:border-brand hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon name="aiAssistant" size={12} />
      {children}
    </button>
  )
}
