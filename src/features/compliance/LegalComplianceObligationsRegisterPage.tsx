import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { Alert, Badge, Button, Card, Dialog, PageHeader, Skeleton } from '../../components/ui'
import {
  downloadLegalComplianceVersionDocument,
  getComplianceExpiryState,
  getLegalComplianceCapabilities,
  listLegalComplianceObligations,
  type LegalComplianceObligation,
  type LegalComplianceVersion,
} from './legalComplianceService'
import { Icon } from '../../components/ui/icon'
import type { AppRoute } from '../../app/routes'

type DocumentPreview = { url: string; filename: string; mimeType: string | null }

function expiryLabel(expiryDate: string | null, daysRemaining: number | null) {
  if (!expiryDate) return 'No expiry'
  if (daysRemaining === 0) return 'Expires today'
  if (daysRemaining !== null && daysRemaining < 0) return `Expired ${Math.abs(daysRemaining)} ${Math.abs(daysRemaining) === 1 ? 'day' : 'days'} ago`
  return `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} remaining`
}

function expiryTone(state: ReturnType<typeof getComplianceExpiryState>['state']) {
  if (state === 'expired') return 'danger'
  if (state === 'expiring_soon') return 'warning'
  if (state === 'valid') return 'success'
  return 'neutral'
}

function formatDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString()
}

export function LegalComplianceObligationsRegisterPage({ client, organizationId, previousRoute }: {
  client: SupabaseClient
  organizationId: string
  previousRoute: AppRoute | null
}) {
  const [canView, setCanView] = useState(false)
  const [records, setRecords] = useState<LegalComplianceObligation[]>([])
  const [people, setPeople] = useState<Record<string, string>>({})
  const [sites, setSites] = useState<Record<string, string>>({})
  const [selectedRecord, setSelectedRecord] = useState<LegalComplianceObligation | null>(null)
  const [preview, setPreview] = useState<DocumentPreview | null>(null)
  const [busyVersionId, setBusyVersionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const backRoute = previousRoute === 'dashboard' || previousRoute === 'executive-analytics' ? previousRoute : null

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const access = await getLegalComplianceCapabilities(client, organizationId)
        if (!active) return
        setCanView(access.canView)
        if (!access.canView) return
        const obligations = await listLegalComplianceObligations(client, organizationId)
        if (!active) return
        setRecords(obligations)
        const responsibleIds = [...new Set(obligations.flatMap((item) => item.versions.map((version) => version.responsible_person_id)))]
        const siteIds = [...new Set(obligations.flatMap((item) => item.site_id ? [item.site_id] : []))]
        const [profileResult, siteResult] = await Promise.all([
          responsibleIds.length ? client.from('profiles').select('id, full_name').eq('organization_id', organizationId).in('id', responsibleIds) : Promise.resolve({ data: [], error: null }),
          siteIds.length ? client.from('sites').select('id, name').eq('organization_id', organizationId).in('id', siteIds) : Promise.resolve({ data: [], error: null }),
        ])
        if (!active) return
        if (profileResult.error || siteResult.error) throw profileResult.error || siteResult.error
        setPeople(Object.fromEntries((profileResult.data || []).map((person) => [person.id, person.full_name || 'Organization member'])))
        setSites(Object.fromEntries((siteResult.data || []).map((site) => [site.id, site.name])))
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load the Legal and Compliance Register.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [client, organizationId])

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url)
  }, [preview])

  const openDocument = async (version: LegalComplianceVersion) => {
    if (!version.document_path) return
    setBusyVersionId(version.id)
    setError('')
    try {
      const { blob, filename } = await downloadLegalComplianceVersionDocument(client, version)
      const url = URL.createObjectURL(blob)
      setPreview({ url, filename, mimeType: version.document_mime_type })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to open the supporting document.')
    } finally {
      setBusyVersionId(null)
    }
  }

  const downloadDocument = async (version: LegalComplianceVersion) => {
    if (!version.document_path) return
    setBusyVersionId(version.id)
    setError('')
    try {
      const { blob, filename } = await downloadLegalComplianceVersionDocument(client, version)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to download the supporting document.')
    } finally {
      setBusyVersionId(null)
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Organization register"
        title="Legal and Compliance Obligations Register"
        description="Review obligations, current validity, and their version history."
        actions={
          <Button variant="outline" size="sm" onClick={() => {
            if (backRoute) window.history.back()
            else window.location.hash = '#dashboard'
          }}>
            <Icon name="arrowLeft" size={15} />Back
          </Button>
        }
      />
      {error && <Alert tone="danger">{error}</Alert>}
      {loading ? <div className="grid gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        : !canView ? <Alert tone="warning">You don't have permission, contact your Super Admin</Alert>
          : records.length === 0 ? <Card className="p-6 text-sm text-muted">No legal or compliance obligations have been added.</Card>
            : <div className="grid gap-3">
              {records.map((record) => {
                const expiry = getComplianceExpiryState(record.active_version.expiry_date)
                return (
                  <Card key={record.id} className="grid gap-3 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="grid gap-1">
                        <h2 className="text-base font-semibold text-foreground">{record.obligation_name}</h2>
                        <p className="text-sm text-muted">{record.category[0].toUpperCase() + record.category.slice(1)} · {record.issuing_authority}</p>
                      </div>
                      <Badge tone={expiryTone(expiry.state)}>{expiry.state === 'no_expiry' ? 'No expiry' : expiry.state === 'expiring_soon' ? 'Expiring soon' : expiry.state === 'expired' ? 'Expired' : 'Valid'}</Badge>
                    </div>
                    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div><dt className="text-xs text-muted">Scope</dt><dd className="text-foreground">{record.scope_type === 'organization' ? 'Organization' : record.scope_type === 'site' ? sites[record.site_id || ''] || 'Site' : record.department}</dd></div>
                      <div><dt className="text-xs text-muted">Issue date</dt><dd className="text-foreground">{formatDate(record.active_version.issue_date)}</dd></div>
                      <div><dt className="text-xs text-muted">Expiry / validity</dt><dd className="text-foreground">{record.active_version.expiry_date ? `${formatDate(record.active_version.expiry_date)} · ${expiryLabel(record.active_version.expiry_date, expiry.daysRemaining)}` : 'No expiry'}</dd></div>
                      <div><dt className="text-xs text-muted">Responsible person</dt><dd className="text-foreground">{people[record.active_version.responsible_person_id] || 'Organization member'}</dd></div>
                    </dl>
                    <Button size="sm" variant="outline" className="w-fit" onClick={() => setSelectedRecord(record)}>View details and history</Button>
                  </Card>
                )
              })}
            </div>}

      <Dialog
        open={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
        title={selectedRecord?.obligation_name || 'Obligation details'}
        description={selectedRecord ? `${selectedRecord.category[0].toUpperCase() + selectedRecord.category.slice(1)} · ${selectedRecord.issuing_authority}` : undefined}
        className="max-w-3xl"
      >
        {selectedRecord && (() => {
          const record = selectedRecord
          const activeExpiry = getComplianceExpiryState(record.active_version.expiry_date)
          return (
            <div className="grid gap-5">
              <section className="grid gap-3">
                <h3 className="text-sm font-semibold text-foreground">Active version · Version {record.active_version.version_number}</h3>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-xs text-muted">Scope</dt><dd className="text-foreground">{record.scope_type === 'organization' ? 'Organization' : record.scope_type === 'site' ? sites[record.site_id || ''] || 'Site' : record.department}</dd></div>
                  <div><dt className="text-xs text-muted">Issue date</dt><dd className="text-foreground">{formatDate(record.active_version.issue_date)}</dd></div>
                  <div><dt className="text-xs text-muted">Expiry / remaining validity</dt><dd className="text-foreground">{expiryLabel(record.active_version.expiry_date, activeExpiry.daysRemaining)}</dd></div>
                  <div><dt className="text-xs text-muted">Compliance status</dt><dd className="text-foreground">{record.active_version.compliance_status.replaceAll('_', ' ')}</dd></div>
                  <div><dt className="text-xs text-muted">Responsible person</dt><dd className="text-foreground">{people[record.active_version.responsible_person_id] || 'Organization member'}</dd></div>
                  <div><dt className="text-xs text-muted">Uploaded</dt><dd className="text-foreground">{new Date(record.active_version.uploaded_at).toLocaleString()} by {people[record.active_version.uploaded_by || ''] || 'Organization member'}</dd></div>
                  <div><dt className="text-xs text-muted">Supporting document</dt><dd className="text-foreground">{record.active_version.document_name || 'None'}</dd></div>
                </dl>
                {record.active_version.document_path && (
                  <Button size="sm" variant="outline" className="w-fit" disabled={busyVersionId === record.active_version.id} onClick={() => void openDocument(record.active_version)}>
                    View Document
                  </Button>
                )}
              </section>
              {record.versions.length > 1 && (
                <section className="grid gap-3 border-t border-line pt-4">
                  <h3 className="text-sm font-semibold text-foreground">Previous versions</h3>
                  <ol className="grid gap-3">
                    {record.versions.filter((version) => version.id !== record.active_version.id).map((version) => {
                      const expiry = getComplianceExpiryState(version.expiry_date)
                      return (
                        <li key={version.id} className="grid gap-3 rounded-xl border border-line p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <strong className="text-sm text-foreground">Version {version.version_number}</strong>
                            <Badge tone="neutral">Historical · read-only</Badge>
                          </div>
                          <dl className="grid gap-2 text-sm sm:grid-cols-2">
                            <div><dt className="text-xs text-muted">Issue date</dt><dd className="text-foreground">{formatDate(version.issue_date)}</dd></div>
                            <div><dt className="text-xs text-muted">Expiry / validity</dt><dd className="text-foreground">{expiryLabel(version.expiry_date, expiry.daysRemaining)}</dd></div>
                            <div><dt className="text-xs text-muted">Responsible person</dt><dd className="text-foreground">{people[version.responsible_person_id] || 'Organization member'}</dd></div>
                            <div><dt className="text-xs text-muted">Uploaded</dt><dd className="text-foreground">{new Date(version.uploaded_at).toLocaleString()} by {people[version.uploaded_by || ''] || 'Organization member'}</dd></div>
                            <div className="sm:col-span-2"><dt className="text-xs text-muted">Document</dt><dd className="text-foreground">{version.document_name || 'None'}</dd></div>
                          </dl>
                          {version.document_path && (
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" disabled={busyVersionId === version.id} onClick={() => void openDocument(version)}>View Document</Button>
                              <Button size="sm" variant="ghost" disabled={busyVersionId === version.id} onClick={() => void downloadDocument(version)}>Download</Button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                </section>
              )}
            </div>
          )
        })()}
      </Dialog>

      <Dialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.filename || 'Supporting document'}
        description="Organization compliance document"
        className="max-w-5xl"
      >
        {preview && (
          <div className="grid gap-3">
            {preview.mimeType === 'application/pdf' || preview.mimeType === 'text/plain' ? (
              <iframe title={preview.filename} src={preview.url} className="h-[65vh] w-full rounded-lg border border-line bg-white" />
            ) : (
              <p className="text-sm text-muted">Preview is not available for this file type. Download the document to view it.</p>
            )}
            <a href={preview.url} download={preview.filename} className="w-fit text-sm font-semibold text-brand-dark underline underline-offset-4">
              Download document
            </a>
          </div>
        )}
      </Dialog>
    </div>
  )
}
