import { useId, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { groupIncidentTrend, incidentTrendViews, type IncidentTrendView } from './incidentTrend'

export function IncidentTrendChart({ snapshot, onPeriodChange, disabled = false, report = false }: {
  snapshot: SafetySnapshot
  onPeriodChange?: (period: 30 | 90 | 'all') => void
  disabled?: boolean
  report?: boolean
}) {
  const [view, setView] = useState<IncidentTrendView>('month')
  const id = useId()
  const data = snapshot.incidentTrend
  const grouped = useMemo(() => data?.complete ? groupIncidentTrend(data, view) : undefined, [data, view])
  const selected = incidentTrendViews.find((option) => option.value === view)!
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return <section className="incident-trend-card" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Incident Trend</h3>
    <p>Incidents, near misses and closures {selected.label.toLowerCase()}.</p>
    {!report && <label className="incident-trend-selector" htmlFor={`${id}-view`}>
      <span className="sr-only">Group incident trend</span>
      <select id={`${id}-view`} value={view} onChange={(event) => {
        const option = incidentTrendViews.find((item) => item.value === event.target.value)
        if (option) setView(option.value)
      }}>{incidentTrendViews.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
    </label>}
    {onPeriodChange && <div className="safety-window-toggle" role="group" aria-label="Incident Trend reporting period">
      {([30, 90, 'all'] as const).map((period) => <button type="button" key={period}
        className="button button-outline button-small" disabled={disabled}
        aria-pressed={(snapshot.filters.trendDays ?? snapshot.filters.days) === period}
        onClick={() => onPeriodChange(period)}>{period === 'all' ? 'All Time' : `${period} days`}</button>)}
    </div>}
    {!data ? <div className="chart-empty" role="status">
      <strong>Incident trend unavailable</strong><small>The authorized analytics endpoint must be updated before trend data is available.</small>
    </div> : !data.complete ? <div className="auth-message error" role="alert">
      <strong>Complete incident trend data is unavailable.</strong>
      <ul>{data.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      <p>No partial counts are displayed. Use Refresh to retry.</p>
    </div> : <>
      {data.warnings?.map((warning) => <p className="incident-trend-warning" role="status" key={warning}>{warning}</p>)}
      {grouped && grouped.omitted > 0 && <p className="incident-trend-warning" role="status">
        {grouped.omitted} series contributions cannot be grouped because the selected field is missing or no longer matches active company settings.
        Only known grouped counts are shown; no replacement categories are assigned.
      </p>}
      {!grouped?.points.length ? <div className="chart-empty" role="status">
        <strong>No matching incident trend data</strong>
        <small>{grouped?.omitted ? 'Matching records lack a valid company-defined value for this grouping.' : 'No incidents, near misses or actual closures match the selected reporting period.'}</small>
      </div> : <div className="incident-trend-scroll" tabIndex={0} role="region" aria-label="Incident trend grouped bar chart">
        <div className="incident-trend-plot" style={{ minWidth: Math.max(520, grouped.points.length * 110) }}>
          <ResponsiveContainer width={report ? Math.max(760, grouped.points.length * 110) : '100%'} height={350}>
            <BarChart width={report ? Math.max(760, grouped.points.length * 110) : undefined} height={report ? 350 : undefined}
              data={grouped.points} accessibilityLayer margin={{ top: 16, right: 16, bottom: 30, left: 12 }} barGap={4}>
              <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--line)" />
              <XAxis dataKey="label" interval={0} angle={-12} textAnchor="end" height={75}
                tick={{ fill: 'var(--muted)', fontSize: 12 }} stroke="var(--muted)"
                label={{ value: selected.axis, position: 'insideBottom', offset: -12, fill: 'var(--muted)' }} />
              <YAxis allowDecimals={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} stroke="var(--muted)"
                label={{ value: 'Count', angle: -90, position: 'insideLeft', fill: 'var(--muted)' }} />
              <Tooltip cursor={{ fill: 'var(--line)', fillOpacity: 0.3 }}
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12 }}
                labelStyle={{ color: 'var(--text)' }} formatter={(value) => typeof value === 'number' ? value.toFixed(0) : value} />
              <Legend iconType="square" wrapperStyle={{ fontSize: 13, paddingTop: 16 }} />
              <Bar dataKey="incidents" name="Incidents" fill="#ff3b40" radius={[4, 4, 0, 0]} maxBarSize={70} isAnimationActive={false} />
              <Bar dataKey="nearMisses" name="Near Misses" fill="#529fe3" radius={[4, 4, 0, 0]} maxBarSize={70} isAnimationActive={false} />
              <Bar dataKey="closed" name="Closed" fill="#2eb65a" radius={[4, 4, 0, 0]} maxBarSize={70} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>}
    </>}
    <small className="safety-source-note">
      {(snapshot.filters.trendDays ?? snapshot.filters.days) === 'all' ? 'All Time through the snapshot cutoff' : `${snapshot.filters.trendDays ?? snapshot.filters.days}-day reporting period`}. Incidents and near misses use reporting dates; Closed includes all report classifications and uses actual closure dates.
      {' '}Calendar labels use browser-local time ({timezone}); weeks start Monday. {snapshot.scope.visibility === 'personal' ? 'My reports only.' : 'Authorized organization records only.'}
    </small>
  </section>
}
