import type { ReactNode } from 'react'
import { TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { CorrectiveActionPoint, DashboardComparisonPoint, DashboardDistributionPoint, DashboardTrendPoint, InspectionSummary } from './dashboardTypes'

const chartColors = ['#12a94f', '#f97316', '#3b82f6', '#8b5cf6', '#f59e0b', '#64748b']

function ChartCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <article className="dashboard-card chart-card"><div className="dashboard-card-heading"><div><div className="eyebrow">{eyebrow}</div><h3>{title}</h3></div></div>{children}</article>
}

function ChartEmpty({ message, detail }: { message: string; detail: string }) {
  return <div className="chart-empty"><span aria-hidden="true"><TrendingUp size={28} /></span><strong>{message}</strong><small>{detail}</small></div>
}

export function IncidentTrendChart({ data }: { data: DashboardTrendPoint[] }) {
  return <ChartCard eyebrow="SAFETY PERFORMANCE" title="Monthly incident trend">{data.length ? <ResponsiveContainer width="100%" height={220}><LineChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#dfe5ec" /><XAxis dataKey="label" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Line type="monotone" dataKey="incidents" name="Incidents" stroke="#12a94f" strokeWidth={2} /><Line type="monotone" dataKey="nearMisses" name="Near misses" stroke="#f97316" strokeWidth={2} /></LineChart></ResponsiveContainer> : <ChartEmpty message="Insufficient incident history" detail="Trend analysis will appear after incident records are available." />}</ChartCard>
}

export function IncidentSeverityChart({ data }: { data: DashboardDistributionPoint[] }) {
  return <ChartCard eyebrow="INCIDENT INTELLIGENCE" title="Incident severity">{data.length ? <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={3}>{data.map((entry, index) => <Cell key={entry.name} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer> : <ChartEmpty message="No severity data available" detail="Severity distribution will appear when incidents are recorded." />}</ChartCard>
}

export function IncidentTypeChart({ data, configuredTypes }: { data: DashboardDistributionPoint[]; configuredTypes: string[] }) {
  const detail = configuredTypes.length ? `Configured categories: ${configuredTypes.join(', ')}` : 'Configure incident categories in Company Settings.'
  return <ChartCard eyebrow="INCIDENT INTELLIGENCE" title="Incident types">{data.length ? <ResponsiveContainer width="100%" height={220}><BarChart data={data} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#dfe5ec" /><XAxis type="number" allowDecimals={false} /><YAxis dataKey="name" type="category" width={90} /><Tooltip /><Bar dataKey="value" name="Incidents" fill="#12a94f" /></BarChart></ResponsiveContainer> : <ChartEmpty message="No incident type data available" detail={detail} />}</ChartCard>
}

export function ComparisonChart({ title, eyebrow, data, emptyMessage, configuredNames }: { title: string; eyebrow: string; data: DashboardComparisonPoint[]; emptyMessage: string; configuredNames: string[] }) {
  const detail = configuredNames.length ? `Configured: ${configuredNames.join(', ')}` : 'Configuration will appear here when available.'
  return <ChartCard eyebrow={eyebrow} title={title}>{data.length ? <ResponsiveContainer width="100%" height={220}><BarChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#dfe5ec" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" name="Incident count" fill="#3b82f6" /></BarChart></ResponsiveContainer> : <ChartEmpty message={emptyMessage} detail={detail} />}</ChartCard>
}

export function CorrectiveActionChart({ data }: { data: CorrectiveActionPoint[] }) {
  return <ChartCard eyebrow="CORRECTIVE ACTIONS" title="Corrective action status">{data.length ? <ResponsiveContainer width="100%" height={220}><BarChart data={data}><CartesianGrid strokeDasharray="3 3" stroke="#dfe5ec" /><XAxis dataKey="status" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" name="Actions" fill="#f97316" /></BarChart></ResponsiveContainer> : <ChartEmpty message="Corrective action data unavailable" detail="Status analytics will appear with the Corrective Actions module." />}</ChartCard>
}

export function InspectionPerformanceChart({ data }: { data: InspectionSummary | null }) {
  const chartData = data ? [{ name: 'Scheduled', value: data.scheduled }, { name: 'Completed', value: data.completed }, { name: 'Overdue', value: data.overdue }, { name: 'Findings', value: data.findings }] : []
  return <ChartCard eyebrow="COMPLIANCE" title="Inspection performance">{chartData.length ? <ResponsiveContainer width="100%" height={220}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#dfe5ec" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" name="Inspections" fill="#12a94f" /></BarChart></ResponsiveContainer> : <ChartEmpty message="Inspection data unavailable" detail="Completion rate will be calculated when inspection records exist." />}</ChartCard>
}

export default function DashboardCharts({ data }: { data: {
  incidentTrend: DashboardTrendPoint[]
  incidentSeverity: DashboardDistributionPoint[]
  incidentTypes: DashboardDistributionPoint[]
  departmentComparison: DashboardComparisonPoint[]
  siteComparison: DashboardComparisonPoint[]
  correctiveActions: CorrectiveActionPoint[]
  inspections: InspectionSummary | null
  configuredIncidentTypes: string[]
  configuredDepartments: string[]
  configuredSites: string[]
} }) {
  return <div className="dashboard-charts-grid"><IncidentTrendChart data={data.incidentTrend} /><IncidentSeverityChart data={data.incidentSeverity} /><IncidentTypeChart data={data.incidentTypes} configuredTypes={data.configuredIncidentTypes} /><ComparisonChart title="Department comparison" eyebrow="PERFORMANCE" data={data.departmentComparison} configuredNames={data.configuredDepartments} emptyMessage="No department incident data available" /><ComparisonChart title="Site comparison" eyebrow="RISK" data={data.siteComparison} configuredNames={data.configuredSites} emptyMessage="No site incident data available" /><CorrectiveActionChart data={data.correctiveActions} /><InspectionPerformanceChart data={data.inspections} /></div>
}
