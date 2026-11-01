import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ChartCard } from '../../components/ui/chart-card'
import { EmptyState } from '../../components/ui/empty-state'
import { SegmentedControl } from '../../components/ui/segmented-control'
import type { DashboardComparisonPoint, DashboardDistributionPoint, DashboardTrendPoint } from './types'

const chartColors = ['#12a94f', '#f97316', '#3b82f6', '#8b5cf6', '#f59e0b', '#64748b']
const tick = { fill: 'var(--color-muted)', fontSize: 11 }

function truncateLabel(value: string, max = 16) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}
const tooltipStyle = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-line)',
  borderRadius: 10,
  color: 'var(--color-foreground)',
  fontSize: 12,
}

function ChartEmpty({ message, detail, className = 'h-[220px]' }: { message: string; detail: string; className?: string }) {
  return <EmptyState className={`${className} py-0`} icon="trendingUp" title={message} description={detail} />
}

export function IncidentTrendChart({ data }: { data: DashboardTrendPoint[] }) {
  return (
    <ChartCard title="Incident trend" description="Monthly incidents and near misses" className="h-full">
      {data.length ? (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
            <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: 'var(--color-line)' }} />
            <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={32} />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="incidents" name="Incidents" stroke="#12a94f" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            <Line type="monotone" dataKey="nearMisses" name="Near misses" stroke="#f97316" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <ChartEmpty message="Insufficient incident history" detail="Trend analysis will appear after incident records are available." />
      )}
    </ChartCard>
  )
}

export function IncidentSeverityChart({ data }: { data: DashboardDistributionPoint[] }) {
  return (
    <ChartCard title="Severity" description="Effective severity, actual or potential">
      {data.length ? (
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={76} paddingAngle={2} stroke="var(--color-surface)">
              {data.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <ChartEmpty className="h-[200px]" message="No severity data" detail="Severity distribution will appear when incidents are recorded." />
      )}
    </ChartCard>
  )
}

export function IncidentTypeChart({ data, configuredTypes }: { data: DashboardDistributionPoint[]; configuredTypes: string[] }) {
  const detail = configuredTypes.length ? `Configured categories: ${configuredTypes.join(', ')}` : 'Configure incident categories in Company Settings.'
  const chartHeight = Math.max(260, Math.min(340, data.length * 34))
  return (
    <ChartCard title="Incident categories" description="Recorded category mix">
      {data.length ? (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data} layout="vertical" barCategoryGap={14} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={tick} tickLine={false} axisLine={{ stroke: 'var(--color-line)' }} />
            <YAxis dataKey="name" type="category" width={118} interval={0} tick={tick} tickMargin={8} tickLine={false} axisLine={false} tickFormatter={(value) => truncateLabel(String(value), 18)} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" name="Incidents" fill="#12a94f" radius={[0, 4, 4, 0]} barSize={10} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <ChartEmpty message="No incident category data" detail={detail} />
      )}
    </ChartCard>
  )
}

export function DashboardComparisons({ department, site, configuredDepartments, configuredSites }: {
  department: DashboardComparisonPoint[]
  site: DashboardComparisonPoint[]
  configuredDepartments: string[]
  configuredSites: string[]
}) {
  const [view, setView] = useState<'department' | 'site'>('department')
  const data = view === 'department' ? department : site
  const configured = view === 'department' ? configuredDepartments : configuredSites

  return (
    <ChartCard
      title="Comparisons"
      description={view === 'department' ? 'Incidents by department' : 'Incidents by site'}
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl
          label="Comparison view"
          value={view}
          onChange={(value) => setView(value)}
          options={[{ value: 'department', label: 'Department' }, { value: 'site', label: 'Site' }]}
          className="self-start"
        />

        {data.length ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={tick}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-line)' }}
                interval={0}
                angle={-90}
                textAnchor="end"
                height={110}
                tickFormatter={(value) => truncateLabel(String(value), 16)}
              />
              <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" name="Incidents" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmpty
            className="h-[200px]"
            message="No comparison data"
            detail={configured.length ? `Configured: ${configured.join(', ')}` : 'Configuration will appear here when available.'}
          />
        )}
      </div>
    </ChartCard>
  )
}
