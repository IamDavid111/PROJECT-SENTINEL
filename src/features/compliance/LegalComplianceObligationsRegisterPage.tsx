import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { Alert, Button, Card, PageHeader, Skeleton } from '../../components/ui'
import {
  downloadLegalComplianceDocument,
  getLegalComplianceCapabilities,
  listLegalComplianceObligations,
  type LegalComplianceObligation,
} from './legalComplianceService'

export function LegalComplianceObligationsRegisterPage({ client, organizationId }: {
  client: SupabaseClient
  organizationId: string
}) {
  const [canView, setCanView] = useState(false)
  const [records, setRecords] = useState<LegalComplianceObligation[]>([])
  const [people, setPeople] = useState<Record<string, string>>({})
  const [sites, setSites] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
        const responsibleIds = [...new Set(obligations.map((item) => item.active_version.responsible_person_id))]
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

  const download = async (record: LegalComplianceObligation) => {
    try {
      const { blob, filename } = await downloadLegalComplianceDocument(client, record)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to download the supporting document.')
    }
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow="Organization register"
        title="Legal and Compliance Obligations Register"
        description="Organization legal and compliance obligations."
      />
      {loading ? <div className="grid gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        : error ? <Alert tone="danger">{error}</Alert>
          : !canView ? <Alert tone="warning">You don't have permission, contact your Super Admin</Alert>
            : records.length === 0 ? <Card className="p-6 text-sm text-muted">No legal or compliance obligations have been added.</Card>
              : <div className="grid gap-3">
                {records.map((record) => (
                  <Card key={record.id} className="grid gap-3 p-4 sm:p-5">
                    <div className="grid gap-1">
                      <h2 className="text-base font-semibold text-foreground">{record.obligation_name}</h2>
                      <p className="text-sm text-muted">{record.category[0].toUpperCase() + record.category.slice(1)} · {record.issuing_authority}</p>
                    </div>
                    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <div><dt className="text-xs text-muted">Scope</dt><dd className="text-foreground">{record.scope_type === 'organization' ? 'Organization' : record.scope_type === 'site' ? sites[record.site_id || ''] || 'Site' : record.department}</dd></div>
                      <div><dt className="text-xs text-muted">Issue date</dt><dd className="text-foreground">{record.active_version.issue_date}</dd></div>
                      <div><dt className="text-xs text-muted">Expiry date</dt><dd className="text-foreground">{record.active_version.expiry_date || 'No expiry'}</dd></div>
                      <div><dt className="text-xs text-muted">Responsible person</dt><dd className="text-foreground">{people[record.active_version.responsible_person_id] || 'Organization member'}</dd></div>
                      <div><dt className="text-xs text-muted">Compliance status</dt><dd className="text-foreground">{record.active_version.compliance_status.replaceAll('_', ' ')}</dd></div>
                      <div><dt className="text-xs text-muted">Supporting document</dt><dd className="text-foreground">{record.active_version.document_name || 'None'}</dd></div>
                    </dl>
                    {record.active_version.document_path && <Button size="sm" variant="outline" className="w-fit" onClick={() => void download(record)}>Download document</Button>}
                  </Card>
                ))}
              </div>}
    </div>
  )
}