import { cn } from '../../lib/utils'
import { DropdownMenu, type DropdownMenuItem } from './dropdown-menu'
import { Icon, type IconProps } from './icon'

export type ExportFormat = 'pdf' | 'docx' | 'xlsx' | 'csv' | 'print'

export interface ExportOption {
  format: ExportFormat
  label: string
  icon?: IconProps['name']
}

export interface ExportMenuProps {
  onExport: (format: ExportFormat) => void
  busy?: boolean
  disabled?: boolean
  label?: string
  options?: readonly ExportOption[]
  className?: string
}

export const DEFAULT_EXPORT_OPTIONS: readonly ExportOption[] = [
  { format: 'pdf', label: 'PDF', icon: 'fileDownload' },
  { format: 'docx', label: 'Word document (.docx)', icon: 'file' },
  { format: 'xlsx', label: 'Excel workbook (.xlsx)', icon: 'database' },
  { format: 'csv', label: 'CSV', icon: 'download' },
  { format: 'print', label: 'Print', icon: 'print' },
]

/** Export dropdown used by reports and executive analytics. */
export function ExportMenu({
  onExport,
  busy = false,
  disabled = false,
  label = 'Export Report',
  options = DEFAULT_EXPORT_OPTIONS,
  className,
}: ExportMenuProps) {
  const items: DropdownMenuItem[] = options.map((option) => ({
    id: option.format,
    label: option.label,
    icon: option.icon,
    disabled: busy || disabled,
    onSelect: () => onExport(option.format),
  }))

  return (
    <DropdownMenu
      className={cn(className)}
      label={
        <>
          <Icon name="download" size={15} />
          {busy ? 'Preparing report…' : label}
        </>
      }
      items={items}
    />
  )
}
