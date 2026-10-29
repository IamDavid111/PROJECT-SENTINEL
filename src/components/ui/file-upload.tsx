import { useRef, useState, type DragEvent, type ReactNode } from 'react'

import { cn } from '../../lib/utils'
import { Icon } from './icon'
import { IconButton } from './icon-button'

export interface FileUploadItem {
  id: string
  name: string
  size?: number
  type?: string
}

export interface FileUploadProps {
  files: readonly FileUploadItem[]
  onFilesSelected: (files: File[]) => void
  onRemove: (id: string) => void
  accept?: string
  multiple?: boolean
  maxSizeMb?: number
  label?: ReactNode
  hint?: ReactNode
  disabled?: boolean
  variant?: 'dropzone' | 'compact'
  className?: string
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Controlled file picker: drag/drop dropzone or compact trigger + file list. */
export function FileUpload({
  files,
  onFilesSelected,
  onRemove,
  accept,
  multiple = false,
  maxSizeMb = 10,
  label = 'Drop files here or browse',
  hint,
  disabled = false,
  variant = 'dropzone',
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [rejection, setRejection] = useState('')

  const handleFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return
    const accepted: File[] = []
    const rejected: string[] = []
    Array.from(incoming).forEach((file) => {
      if (file.size > maxSizeMb * 1024 * 1024) rejected.push(file.name)
      else accepted.push(file)
    })
    setRejection(rejected.length ? `${rejected.join(', ')} exceeds the ${maxSizeMb} MB limit.` : '')
    if (accepted.length) onFilesSelected(multiple ? accepted : accepted.slice(0, 1))
    if (inputRef.current) inputRef.current.value = ''
  }

  const onDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setDragging(false)
    if (!disabled) handleFiles(event.dataTransfer.files)
  }

  return (
    <div className={cn('grid gap-3', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        hidden
        onChange={(event) => handleFiles(event.target.files)}
      />

      {variant === 'dropzone' ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault()
            if (!disabled) setDragging(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-5 py-7 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50',
            dragging ? 'border-brand bg-brand/10' : 'border-line bg-surface-soft hover:border-brand/50 hover:bg-brand/5',
          )}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand/10 text-brand">
            <Icon name="upload" size={18} />
          </span>
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-xs text-muted">
            {hint ?? `${accept ? `${accept} · ` : ''}up to ${maxSizeMb} MB`}
          </span>
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-9 w-fit items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="upload" size={15} />
          {label}
        </button>
      )}

      {rejection && <p className="text-xs text-danger" role="alert">{rejection}</p>}

      {files.length > 0 && (
        <ul className="grid gap-2">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <Icon name="file" size={15} className="shrink-0 text-muted" />
                <span className="grid min-w-0">
                  <span className="truncate text-sm text-foreground">{file.name}</span>
                  <span className="text-[11px] text-muted">{formatBytes(file.size)}{file.type ? ` · ${file.type}` : ''}</span>
                </span>
              </span>
              <IconButton icon="close" label={`Remove ${file.name}`} onClick={() => onRemove(file.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
