import { Badge, Button } from '../../components/ui'

export function ReportWizardFooter({ activeStage, stageCount, isBusy, isSaving, isSubmitting, draftReference, draftType, onBack, onSaveDraft, onContinue }: {
  activeStage: number
  stageCount: number
  isBusy: boolean
  isSaving: boolean
  isSubmitting: boolean
  draftReference: string
  draftType: 'manual' | 'offline-pending' | null
  onBack: () => void
  onSaveDraft: () => void
  onContinue: () => void
}) {
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface/95 p-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted">
        <Badge tone={draftType === 'offline-pending' ? 'warning' : 'neutral'}>
          {draftType === 'offline-pending' ? 'Offline pending' : draftReference ? `Draft ${draftReference}` : 'New report'}
        </Badge>
        {isSaving && <span>Saving…</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {activeStage > 0 && (
          <Button variant="outline" size="sm" type="button" disabled={isBusy} onClick={onBack}>Back</Button>
        )}
        <Button variant="outline" size="sm" type="button" loading={isSaving} disabled={isBusy} onClick={onSaveDraft}>Save draft</Button>
        {activeStage < stageCount - 1 ? (
          <Button size="sm" type="button" disabled={isBusy} onClick={onContinue}>Continue</Button>
        ) : (
          <Button size="sm" type="submit" loading={isSubmitting} disabled={isBusy}>Submit incident</Button>
        )}
      </div>
    </div>
  )
}
