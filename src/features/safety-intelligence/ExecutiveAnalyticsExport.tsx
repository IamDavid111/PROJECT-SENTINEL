import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SafetyFilters, SafetyScope, SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { Alert, ExportMenu } from '../../components/ui'
import { type AnalyticsReportFormat, prepareExecutiveAnalyticsReport, outputExecutiveAnalyticsReport } from './executiveAnalyticsReport'

const reportOptions = [
  { format: 'pdf' as const, label: 'PDF', icon: 'fileDownload' as const },
  { format: 'docx' as const, label: 'Word document (.docx)', icon: 'file' as const },
  { format: 'print' as const, label: 'Print', icon: 'print' as const },
]

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
  return <div className="grid gap-2">
    <ExportMenu
      busy={busy}
      disabled={disabled}
      options={reportOptions}
      onExport={(format) => {
        if (format === 'pdf' || format === 'docx' || format === 'print') void run(format)
      }}
    />
    {error && <Alert tone="danger">{error}</Alert>}
  </div>
}
