import { ArrowRight } from 'lucide-react'

import { Card } from '../../components/ui'

export function OrganizationManagementSystemsSection({ complianceLabel = 'Compliance' }: {
  complianceLabel?: 'Compliance' | 'Compliance Performance'
}) {
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
          <a href="#legal-compliance-obligations-register" className="w-fit text-sm font-semibold text-caution underline decoration-caution/50 underline-offset-4 transition-colors hover:decoration-caution focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-caution/50">
            View Compliance Register <span aria-hidden="true">→</span>
          </a>
        </Card>
      </div>
    </section>
  )
}