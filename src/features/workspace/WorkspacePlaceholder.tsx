import { ArrowRight } from 'lucide-react'

export function WorkspacePlaceholder({ title, description, action, onAction, actionDisabled = false }: {
  title: string; description: string; action: string; onAction?: () => void; actionDisabled?: boolean
}) {
  // Executive Analytics uses the foundation CTA to open its existing authorized view.
  const actionContent = <><ArrowRight size={19} aria-hidden="true" /><strong>{action}</strong></>
  return <div className="workspace-panel workspace-placeholder"><div className="eyebrow">MODULE FOUNDATION</div><h2>{title}</h2><p>{description}</p>
    {onAction
      ? <button type="button" className="workspace-placeholder-action" onClick={onAction} disabled={actionDisabled}>{actionContent}</button>
      : <div className="workspace-placeholder-action">{actionContent}</div>}
  </div>
}

