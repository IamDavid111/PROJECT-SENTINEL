import { Badge, Card, Icon } from '../../components/ui'

export function MarketplacePage() {
  return <section className="grid min-h-[60vh] place-items-center" aria-labelledby="marketplace-title">
    <Card className="flex w-full max-w-2xl flex-col items-center gap-5 p-8 text-center sm:p-10">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10 text-brand">
        <Icon name="marketplace" size={30} />
      </span>
      <div className="flex items-center gap-2">
        <span className="h-px w-6 bg-brand" aria-hidden="true" />
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Module foundation</span>
      </div>
      <div className="grid gap-2">
        <h1 id="marketplace-title" className="font-display text-2xl font-semibold tracking-tight text-foreground">HSE Marketplace</h1>
        <p className="max-w-lg text-sm text-muted">The marketplace is reserved for approved HSE tools, services, and integrations.</p>
      </div>
      <Badge tone="warning" className="w-fit">
        <Icon name="clock" size={13} />
        Marketplace coming soon
      </Badge>
    </Card>
  </section>
}
