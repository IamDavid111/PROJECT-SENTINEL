import { Icon } from '../../components/ui'

export function ReportStepRail({ stages, activeStage, onSelect }: {
  stages: readonly string[]
  activeStage: number
  onSelect: (index: number) => void
}) {
  return (
    <aside className="hidden h-fit rounded-card border border-line bg-surface p-3 lg:sticky lg:top-24 lg:block">
      <span className="px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Report stages</span>
      <div className="mt-1 grid gap-1">
        {stages.map((stage, index) => (
          <button
            key={stage}
            type="button"
            onClick={() => index <= activeStage && onSelect(index)}
            disabled={index > activeStage}
            aria-current={index === activeStage ? 'step' : undefined}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${index === activeStage ? 'bg-brand/10 font-medium text-brand-dark' : index < activeStage ? 'text-foreground hover:bg-surface-soft' : 'text-muted'}`}
          >
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] ${index < activeStage ? 'border-brand/40 bg-brand/15 text-brand' : index === activeStage ? 'border-brand/40 text-brand' : 'border-line text-muted'}`}>
              {index < activeStage ? <Icon name="check" size={12} /> : String(index + 1).padStart(2, '0')}
            </span>
            <span className="truncate">{stage}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}

export function ReportStepChips({ stages, activeStage, onSelect }: {
  stages: readonly string[]
  activeStage: number
  onSelect: (index: number) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
      {stages.map((stage, index) => (
        <button
          key={stage}
          type="button"
          onClick={() => index <= activeStage && onSelect(index)}
          disabled={index > activeStage}
          aria-current={index === activeStage ? 'step' : undefined}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${index === activeStage ? 'border-brand bg-brand/10 text-brand-dark' : index < activeStage ? 'border-line bg-surface text-foreground' : 'border-line bg-surface text-muted'}`}
        >
          {index < activeStage ? <Icon name="check" size={11} /> : <span className="font-mono">{index + 1}</span>}
          {stage}
        </button>
      ))}
    </div>
  )
}
