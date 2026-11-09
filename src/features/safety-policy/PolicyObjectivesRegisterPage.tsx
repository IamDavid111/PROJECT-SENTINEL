import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { Alert, Button, Card, Dialog, PageHeader, Skeleton } from '../../components/ui'
import {
  downloadPolicyObjectiveDocument,
  getPolicyObjectivesCapabilities,
  listPolicyObjectives,
  type PolicyObjectiveRecord,
} from './policyObjectivesService'
import { Icon } from '../../components/ui/icon'
import type { AppRoute } from '../../app/routes'

export function PolicyObjectivesRegisterPage({ client, organizationId, previousRoute }: {
  client: SupabaseClient
  organizationId: string
  previousRoute: AppRoute | null
}) {
  const [records, setRecords] = useState<PolicyObjectiveRecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<PolicyObjectiveRecord | null>(null)
  const [canView, setCanView] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const backRoute = previousRoute === 'dashboard' || previousRoute === 'executive-analytics' ? previousRoute : null

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const capabilities = await getPolicyObjectivesCapabilities(client, organizationId)
        if (!active) return
        setCanView(capabilities.canView)
        if (capabilities.canView) setRecords(await listPolicyObjectives(client, organizationId))
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load the Policy and Objectives Register.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [client, organizationId])

  const downloadDocument = async () => {
    if (!selectedRecord) return
    setError('')
    try {
      const { blob, filename } = await downloadPolicyObjectiveDocument(client, selectedRecord)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to download the supporting document.')
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Organization register"
        title="Policy and Objectives Register"
        description="Approved organizational HSSE policies, objectives, performance targets, and baselines."
        actions={
          <Button variant="outline" size="sm" onClick={() => {
            if (backRoute) window.history.back()
            else window.location.hash = '#dashboard'
          }}>
            <Icon name="arrowLeft" size={15} />Back
          </Button>
        }
      />

      {loading ? (
        <div className="grid gap-3" aria-label="Loading Policy and Objectives Register">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : error ? (
        <Alert tone="danger">{error}</Alert>
      ) : !canView ? (
        <Alert tone="warning">You don't have permission, contact your Super Admin</Alert>
      ) : records.length === 0 ? (
        <Card className="p-6 text-sm text-muted">No approved policies or objectives have been added.</Card>
      ) : (
        <div className="grid gap-3">
          {records.map((record) => (
            <button
              key={record.id}
              type="button"
              onClick={() => { setSelectedRecord(record); setError('') }}
              className="grid w-full gap-3 rounded-card border border-line bg-surface p-4 text-left shadow-card transition-colors hover:border-brand/50 hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 sm:p-5"
              aria-haspopup="dialog"
            >
              <span className="flex flex-wrap items-start justify-between gap-3">
                <span className="grid gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-dark">
                    {record.item_type === 'policy' ? 'HSSE Policy' : 'HSSE Objective'} · Approved
                  </span>
                  <span className="text-base font-semibold text-foreground">{record.title}</span>
                </span>
                <span className="text-xs font-medium text-brand-dark">View details →</span>
              </span>
              {record.description && <span className="line-clamp-2 text-sm leading-6 text-muted">{record.description}</span>}
              <span className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                {record.performance_target && <span>Target: {record.performance_target}</span>}
                {record.baseline_value && <span>Baseline: {record.baseline_value}</span>}
                {record.document_name && <span>Supporting document attached</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
        title={selectedRecord?.title ?? 'Policy or objective details'}
        description={selectedRecord
          ? `${selectedRecord.item_type === 'policy' ? 'Approved HSSE Policy' : 'Approved HSSE Objective'} · Organization register`
          : undefined}
        className="sm:max-w-2xl"
        footer={selectedRecord?.document_path && selectedRecord.document_name
          ? <Button size="sm" onClick={() => void downloadDocument()}>Download supporting document</Button>
          : undefined}
      >
        {selectedRecord && (
          <div className="grid gap-5">
            {error && <Alert tone="danger">{error}</Alert>}
            {selectedRecord.description && <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{selectedRecord.description}</p>}
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-1 border-t border-line pt-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Performance target</dt>
                <dd className="whitespace-pre-wrap text-sm text-foreground">{selectedRecord.performance_target || 'Not specified'}</dd>
              </div>
              <div className="grid content-start gap-1 border-t border-line pt-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Baseline value</dt>
                <dd className="whitespace-pre-wrap text-sm text-foreground">{selectedRecord.baseline_value || 'Not specified'}</dd>
              </div>
              <div className="grid content-start gap-1 border-t border-line pt-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Approval status</dt>
                <dd className="text-sm font-medium text-success">Approved</dd>
              </div>
              <div className="grid content-start gap-1 border-t border-line pt-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Supporting document</dt>
                <dd className="break-words text-sm text-foreground">{selectedRecord.document_name || 'None attached'}</dd>
              </div>
            </dl>
          </div>
        )}
      </Dialog>
    </div>
  )
}