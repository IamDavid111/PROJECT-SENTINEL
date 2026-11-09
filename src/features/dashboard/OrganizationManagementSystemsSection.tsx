import { ArrowRight } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { Card } from '../../components/ui'
import { getLegalComplianceSummary, legalComplianceSummaryUpdatedEvent } from '../compliance/legalComplianceService'

export function OrganizationManagementSystemsSection({ client, organizationId, complianceLabel = 'Compliance' }: {
  client: SupabaseClient
  organizationId: string
  complianceLabel?: 'Compliance' | 'Compliance Performance'
}) {
  const queryClient = useQueryClient()
  const summary = useQuery({
    queryKey: ['legal-compliance-summary', organizationId],
    queryFn: () => getLegalComplianceSummary(client, organizationId),
    enabled: Boolean(organizationId),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  })

  useEffect(() => {
    const handleSummaryUpdated = (event: Event) => {
      const eventOrganizationId = (event as CustomEvent<{ organizationId?: string }>).detail?.organizationId
      if (!eventOrganizationId || eventOrganizationId === organizationId) {
        void queryClient.invalidateQueries({ queryKey: ['legal-compliance-summary', organizationId] })
      }
    }
    window.addEventListener(legalComplianceSummaryUpdatedEvent, handleSummaryUpdated)
    return () => window.removeEventListener(legalComplianceSummaryUpdatedEvent, handleSummaryUpdated)
  }, [organizationId, queryClient])

  const summaryValue = (value: number | undefined) => summary.isPending ? '—' : value?.toLocaleString() ?? '—'
  const complianceMetrics: Array<{ label: string; value: number | undefined }> = [
    { label: 'Total active', value: summary.data?.total },
    { label: 'Valid', value: summary.data?.valid },
    { label: 'Expiring (30d)', value: summary.data?.expiring_soon },
    { label: 'Expired', value: summary.data?.expired },
  ]

  return (
    <section className="grid gap-4 border-t border-line pt-5" aria-labelledby="organization-management-systems-title">
      <h2 id="organization-management-systems-title" className="font-display text-lg font-semibold text-foreground">
        Organization and Management Systems
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="grid gap-3 border-brand/30 p-5 shadow-none transition-colors hover:border-brand/60">
          <a href="#policy-objectives-register" className="group grid gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50">
            <span className="flex items-center justify-between gap-3">
              <span className="text-base font-semibold text-foreground group-hover:underline group-hover:underline-offset-4">Policy and Objectives</span>
              <ArrowRight size={18} className="shrink-0 text-brand transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </span>
            <span className="text-sm leading-6 text-muted">Approved HSSE policies, objectives, targets, and baselines.</span>
          </a>
          <a href="#policy-objectives-register" className="w-fit text-sm font-semibold text-brand-dark underline decoration-brand/40 underline-offset-4 transition-colors hover:decoration-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50">
            View Policy and Objectives Register <span aria-hidden="true">→</span>
          </a>
        </Card>

        <Card className="grid gap-3 border-caution/40 p-5 shadow-none transition-colors hover:border-caution">
          <a href="#legal-compliance-obligations-register" className="group grid gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caution/50">
            <span className="flex items-center justify-between gap-3">
              <span className="text-base font-semibold text-foreground group-hover:underline group-hover:underline-offset-4">{complianceLabel}</span>
              <ArrowRight size={18} className="shrink-0 text-caution transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </span>
            <span className="text-sm leading-6 text-muted">Legal and compliance obligations.</span>
          </a>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {complianceMetrics.map(({ label, value }) => (
              <div key={label} className="grid gap-1">
                <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</dt>
                <dd className="font-display text-xl font-semibold tabular-nums text-foreground">{summaryValue(value)}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">Valid includes obligations with no expiry date.</p>
          {summary.isError && <p className="text-sm text-danger" role="status">Compliance totals are temporarily unavailable.</p>}
          <a href="#legal-compliance-obligations-register" className="w-fit text-sm font-semibold text-caution underline decoration-caution/50 underline-offset-4 transition-colors hover:decoration-caution focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caution/50">
            View Compliance Register <span aria-hidden="true">→</span>
          </a>
        </Card>
      </div>
    </section>
  )
}