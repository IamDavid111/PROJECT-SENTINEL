import { useId, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { Alert, ChartCard, EmptyState, Select } from '../../components/ui'
import { groupIncidentTrend, incidentTrendViews, type IncidentTrendView } from './incidentTrend'

export function IncidentTrendChart({ snapshot, report = false }: {
  snapshot: SafetySnapshot
  report?: boolean
}) {
  const [view, setView] = useState<IncidentTrendView>('month')
  const id = useId()
  const data = snapshot.incidentTrend
  const grouped = useMemo(() => data?.complete ? groupIncidentTrend(data, view) : undefined, [data, view])
  const selected = incidentTrendViews.find((option) => option.value === view)!
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const trendPeriod = snapshot.filters.trendDays ?? snapshot.filters.days
  return <ChartCard
    className="shadow-none"
    title={<span id={`${id}-title`}>Incident trend</span>}
    description={`Incidents, near misses and closures ${selected.label.toLowerCase()}.`}
    actions={!report && (
      <label className="grid min-w-[170px] gap-1 text-[11px] font-medium text-muted" htmlFor={`${id}-view`}>
        Group by
        <Select id={`${id}-view`} value={view} onChange={(event) => {
          const option = incidentTrendViews.find((item) => item.value === event.target.value)
          if (option) setView(option.value)
        }}>
          {incidentTrendViews.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      </label>
    )}
    footer={
      <>
        {trendPeriod === 'all' ? 'All Time through the snapshot cutoff' : `${trendPeriod}-day reporting period`}. Incidents and near misses use reporting dates; Closed includes all report classifications and uses actual closure dates.
        {' '}Calendar labels use browser-local time ({timezone}); weeks start Monday. {snapshot.scope.visibility === 'personal' ? 'My reports only.' : 'Authorized organization records only.'}
      </>
    }
  >
    {!data ? <EmptyState icon="analyticsUp" title="Incident trend unavailable"
      description="The authorized analytics endpoint must be updated before trend data is available." />
      : !data.complete ? <Alert tone="danger" title="Complete incident trend data is unavailable.">
        <ul className="list-disc pl-4">{data.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        <p className="mt-2">No partial counts are displayed. Use Refresh to retry.</p>
      </Alert> : <>
        {data.warnings?.map((warning) => <Alert tone="warning" key={warning}>{warning}</Alert>)}
        {grouped && grouped.omitted > 0 && <Alert tone="warning">
          {grouped.omitted} series contributions cannot be grouped because the selected field is missing or no longer matches active company settings.
          Only known grouped counts are shown; no replacement categories are assigned.
        </Alert>}
        {!grouped?.points.length ? <EmptyState icon="analyticsUp" title="No matching incident trend data"
          description={grouped?.omitted ? 'Matching records lack a valid company-defined value for this grouping.' : 'No incidents, near misses or actual closures match the selected reporting period.'} />
          : <div className="incident-trend-scroll overflow-x-auto rounded-xl border border-line bg-surface-soft/30 p-2" tabIndex={0} role="region" aria-label="Incident trend grouped bar chart">
            <div className="incident-trend-plot" style={{ minWidth: Math.max(520, grouped.points.length * 110) }}>
              <ResponsiveContainer width={report ? Math.max(760, grouped.points.length * 110) : '100%'} height={350}>
                <BarChart width={report ? Math.max(760, grouped.points.length * 110) : undefined} height={report ? 350 : undefined}
                  data={grouped.points} accessibilityLayer margin={{ top: 16, right: 16, bottom: 30, left: 12 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--color-line)" />
                  <XAxis dataKey="label" interval={0} angle={-12} textAnchor="end" height={75}
                    tick={{ fill: 'var(--color-muted)', fontSize: 12 }} stroke="var(--color-muted)"
                    label={{ value: selected.axis, position: 'insideBottom', offset: -12, fill: 'var(--color-muted)' }} />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--color-muted)', fontSize: 12 }} stroke="var(--color-muted)"
                    label={{ value: 'Count', angle: -90, position: 'insideLeft', fill: 'var(--color-muted)' }} />
                  <Tooltip cursor={{ fill: 'var(--color-line)', fillOpacity: 0.3 }}
                    contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 12 }}
                    labelStyle={{ color: 'var(--color-foreground)' }} formatter={(value) => typeof value === 'number' ? value.toFixed(0) : value} />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 13, paddingTop: 16 }} />
                  <Bar dataKey="incidents" name="Incidents" fill="#ff3b40" radius={[4, 4, 0, 0]} maxBarSize={70} isAnimationActive={false} />
                  <Bar dataKey="nearMisses" name="Near Misses" fill="#529fe3" radius={[4, 4, 0, 0]} maxBarSize={70} isAnimationActive={false} />
                  <Bar dataKey="closed" name="Closed" fill="#2eb65a" radius={[4, 4, 0, 0]} maxBarSize={70} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>}
      </>}
  </ChartCard>
}
