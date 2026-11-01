import { BrandMark } from '../../components/brand/BrandMark'
import { Spinner } from '../../components/ui/spinner'
import { cn } from '../../lib/utils'

/** Minimal boot surface used while the app checks the session or opens a workspace. */
export function BootLoadingScreen({ label, isDarkMode }: { label: string; isDarkMode: boolean }) {
  return (
    <div className={cn('grid min-h-screen place-items-center bg-surface p-6 text-foreground', isDarkMode && 'dark-theme')}>
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandMark size="lg" />
        <Spinner size={22} fill="currentColor" className="text-brand" label={label} />
        <p className="text-sm text-muted" aria-hidden="true">{label}</p>
      </div>
    </div>
  )
}
