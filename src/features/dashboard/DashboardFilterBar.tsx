import type { ReactNode } from 'react'

import { Button } from '../../components/ui/button'
import { FilterBar } from '../../components/ui/filter-bar'
import { Icon } from '../../components/ui/icon'
import { Input } from '../../components/ui/input'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Select } from '../../components/ui/select'
import type { DashboardFilterOptions, DashboardFilters } from './types'

const rangeOptions = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
] as const

const basisOptions = [
  { value: 'occurred', label: 'Occurred' },
  { value: 'reported', label: 'Reported' },
] as const

function formatOption(value: string) {
  if (value === 'all') return 'All'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid min-w-[150px] gap-1 text-[11px] font-medium text-muted">
      {label}
      {children}
    </label>
  )
}

/** Inline window controls, active-filter chips, and the secondary filter disclosure. */
export function DashboardFilterBar({ filters, options, open, onChange, onReset, onToggle, shiftStart, shiftEnd, onShiftStart, onShiftEnd }: {
  filters: DashboardFilters
  options: DashboardFilterOptions
  open: boolean
  onChange: (key: keyof DashboardFilters, value: string) => void
  onReset: () => void
  onToggle: () => void
  shiftStart: string
  shiftEnd: string
  onShiftStart: (value: string) => void
  onShiftEnd: (value: string) => void
}) {
  const chips = [
    filters.department !== 'all' ? { key: 'department' as const, label: `Department: ${filters.department}` } : null,
    filters.severity !== 'all' ? { key: 'severity' as const, label: `Severity: ${filters.severity}` } : null,
    filters.incidentType !== 'all' ? { key: 'incidentType' as const, label: `Category: ${filters.incidentType}` } : null,
    filters.shift !== 'all' ? { key: 'shift' as const, label: `Shift: ${filters.shift}` } : null,
  ].filter((chip) => chip !== null)

  return (
    <div className="border-t border-line py-4">
      <div className="flex flex-wrap items-end gap-3">
        <FilterField label="Site">
          <Select value={filters.site} onChange={(event) => onChange('site', event.target.value)} containerClassName="min-w-[160px]">
            {options.site.map((option) => <option key={option} value={option}>{formatOption(option)}</option>)}
          </Select>
        </FilterField>

        <div className="grid gap-1">
          <span className="text-[11px] font-medium text-muted">Window</span>
          <SegmentedControl label="Date range" value={filters.dateRange} onChange={(value) => onChange('dateRange', value)} options={rangeOptions} />
        </div>

        <div className="grid gap-1">
          <span className="text-[11px] font-medium text-muted">Basis</span>
          <SegmentedControl label="Date basis" value={filters.dateBasis} onChange={(value) => onChange('dateBasis', value)} options={basisOptions} />
        </div>

        <div className="flex items-center gap-2 sm:ml-auto">
          {chips.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onReset}>Clear all</Button>
          )}
          <Button variant="outline" size="sm" onClick={onToggle} aria-expanded={open} aria-controls="dashboard-filter-panel">
            <Icon name="filter" size={15} />
            Filters
            {chips.length > 0 && (
              <span className="rounded-full bg-brand-dark px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{chips.length}</span>
            )}
          </Button>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onChange(chip.key, 'all')}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-soft px-2.5 py-1 text-xs text-foreground transition-colors hover:border-brand/40"
            >
              {chip.label}
              <Icon name="close" size={11} />
            </button>
          ))}
        </div>
      )}

      {open && (
        <div id="dashboard-filter-panel" className="mt-3">
          <FilterBar actions={<Button variant="ghost" size="sm" onClick={onReset}>Clear filters</Button>}>
            <FilterField label="Department">
              <Select value={filters.department} onChange={(event) => onChange('department', event.target.value)}>
                {options.department.map((option) => <option key={option} value={option}>{formatOption(option)}</option>)}
              </Select>
            </FilterField>
            <FilterField label="Severity">
              <Select value={filters.severity} onChange={(event) => onChange('severity', event.target.value)}>
                {options.severity.map((option) => <option key={option} value={option}>{formatOption(option)}</option>)}
              </Select>
            </FilterField>
            <FilterField label="Incident category">
              <Select value={filters.incidentType} onChange={(event) => onChange('incidentType', event.target.value)}>
                {options.incidentType.map((option) => <option key={option} value={option}>{formatOption(option)}</option>)}
              </Select>
            </FilterField>
            <FilterField label="Shift">
              <Select value={filters.shift} onChange={(event) => onChange('shift', event.target.value)}>
                {options.shift.map((option) => <option key={option} value={option}>{formatOption(option)}</option>)}
              </Select>
            </FilterField>
            {filters.shift !== 'all' && (
              <>
                <FilterField label="Shift start">
                  <Input type="time" value={shiftStart} onChange={(event) => onShiftStart(event.target.value)} />
                </FilterField>
                <FilterField label="Shift end">
                  <Input type="time" value={shiftEnd} onChange={(event) => onShiftEnd(event.target.value)} />
                </FilterField>
              </>
            )}
          </FilterBar>
        </div>
      )}
    </div>
  )
}
