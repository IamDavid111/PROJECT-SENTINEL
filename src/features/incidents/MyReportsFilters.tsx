import type { ReactNode } from 'react'

import { Button, Card, SearchField, SegmentedControl, Select } from '../../components/ui'
import { incidentReportTypes, incidentStatuses, type IncidentListFilters, type IncidentListScope, type IncidentManagementFilter } from './incidentTypes'
import { label } from './incidentFormatting'

function FilterField({ label: fieldLabel, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-[11px] font-medium text-muted">
      {fieldLabel}
      {children}
    </label>
  )
}

export function MyReportsFilters({ filters, selectedScope, canViewAll, isFetching, sites, severities, departments, categories, onFilterChange, onScopeChange, onReset, onRefresh }: {
  filters: IncidentListFilters
  selectedScope: IncidentListScope
  canViewAll: boolean
  isFetching: boolean
  sites: Array<{ id: string; name: string }>
  severities: string[]
  departments: string[]
  categories: string[]
  onFilterChange: (key: keyof IncidentListFilters, value: string) => void
  onScopeChange: (scope: IncidentListScope) => void
  onReset: () => void
  onRefresh: () => void
}) {
  return (
    <Card className="p-4 shadow-none">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {canViewAll && (
            <SegmentedControl
              label="Reports view"
              value={selectedScope}
              onChange={onScopeChange}
              options={[{ value: 'own', label: 'My reports' }, { value: 'organization', label: 'Organization' }]}
            />
          )}
          <SearchField
            className="min-w-[220px] flex-1"
            value={filters.search || ''}
            onChange={(value) => onFilterChange('search', value)}
            placeholder="Search reference, title, reporter, site"
            label="Search incidents"
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" loading={isFetching} onClick={onRefresh}>
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={onReset}>Reset</Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label="Report type">
            <Select value={filters.reportType || 'all'} onChange={(event) => onFilterChange('reportType', event.target.value)}>
              <option value="all">All report types</option>
              {incidentReportTypes.map((type) => <option value={type} key={type}>{label(type)}</option>)}
            </Select>
          </FilterField>
          <FilterField label="Severity">
            <Select value={filters.severity || 'all'} onChange={(event) => onFilterChange('severity', event.target.value)}>
              <option value="all">All configured severity</option>
              {severities.map((severity) => <option value={severity} key={severity}>{severity}</option>)}
            </Select>
          </FilterField>
          <FilterField label="Status">
            <Select value={filters.status || 'all'} onChange={(event) => onFilterChange('status', event.target.value)}>
              <option value="all">All status</option>
              <option value="open">All open reported incidents</option>
              {incidentStatuses.map((status) => <option value={status} key={status}>{label(status)}</option>)}
            </Select>
          </FilterField>
          <FilterField label="Incident / action filter">
            <Select value={filters.incidentFilter || 'all'} onChange={(event) => onFilterChange('incidentFilter', event.target.value as IncidentManagementFilter)}>
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="closed">Closed</option>
              <option value="investigation">Investigation</option>
              <option value="corrective_action">Corrective Action</option>
              <option value="preventive_action">Preventive Action</option>
            </Select>
          </FilterField>
          <FilterField label="Site">
            <Select value={filters.siteId || 'all'} onChange={(event) => onFilterChange('siteId', event.target.value)}>
              <option value="all">All configured sites</option>
              {sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}
            </Select>
          </FilterField>
          <FilterField label="Department">
            <Select value={filters.department || 'all'} onChange={(event) => onFilterChange('department', event.target.value)}>
              <option value="all">All configured departments</option>
              {departments.map((department) => <option value={department} key={department}>{department}</option>)}
            </Select>
          </FilterField>
          <FilterField label="Category">
            <Select value={filters.incidentCategory || 'all'} onChange={(event) => onFilterChange('incidentCategory', event.target.value)}>
              <option value="all">All configured categories</option>
              {categories.map((category) => <option value={category} key={category}>{category}</option>)}
            </Select>
          </FilterField>
        </div>
      </div>
    </Card>
  )
}
