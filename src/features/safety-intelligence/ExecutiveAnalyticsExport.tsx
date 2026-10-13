import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SafetyFilters, SafetyScope, SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { Download } from 'lucide-react'
import { type AnalyticsReportFormat, prepareExecutiveAnalyticsReport, outputExecutiveAnalyticsReport } from './executiveAnalyticsReport'

export function ExecutiveAnalyticsExport({ client, scope, filters, disabled, refresh, onBusy }: {
  client: SupabaseClient; scope: SafetyScope; filters: SafetyFilters; disabled: boolean;
  refresh: () => Promise<SafetySnapshot>; onBusy: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (format: AnalyticsReportFormat) => {
    if (busy || disabled) return
    setBusy(true)
    onBusy(true)
    setError('')
    try {
      const report = await prepareExecutiveAnalyticsReport(client, scope, filters, refresh)
      await outputExecutiveAnalyticsReport(report, format)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to export Executive Analytics. No report was generated.')
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }
  return <div className="safety-export">
    <details>
      <summary className="button button-outline button-small"><Download size={15} aria-hidden="true" />
        {busy ? 'Preparing report...' : 'Export Report'}</summary>
      <div className="safety-export-options" role="group" aria-label="Export report format">
        {([['pdf', 'PDF'], ['docx', 'Word document (.docx)'], ['print', 'Print']] as const).map(([format, label]) =>
          <button key={format} type="button" className="button button-outline button-small"
            disabled={busy || disabled} onClick={() => void run(format)}>{label}</button>)}
      </div>
    </details>
    {error && <p className="auth-message error" role="alert">{error}</p>}
  </div>
}
