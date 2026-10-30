import { Badge, Button, EmptyState, Toggle } from '../../components/ui'
import type { CompanyShiftSetting } from './companySettingsTypes'
import { SettingsSectionShell } from './SettingsSectionShell'

function shiftMinutes(start: string, end: string) {
  if (!start || !end) return 0
  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  let minutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute)
  if (minutes <= 0) minutes += 24 * 60
  return minutes
}

function shiftDuration(start: string, end: string) {
  const minutes = shiftMinutes(start, end)
  if (!minutes) return 'Time not set'
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`
}

function isOvernight(start: string, end: string) {
  if (!start || !end) return false
  return end <= start
}

export function ShiftsSection({ shifts, dirty, onAdd, onEdit, onToggle }: {
  shifts: CompanyShiftSetting[]
  dirty: boolean
  onAdd: () => void
  onEdit: (shift: CompanyShiftSetting) => void
  onToggle: (id: string) => void
}) {
  return (
    <SettingsSectionShell
      title="Shifts"
      description="Operating windows used by filters, reports, and safety intelligence."
      dirty={dirty}
      action={<Button size="sm" onClick={onAdd}>Add shift</Button>}
    >
      {shifts.length ? (
        <div className="grid gap-2">
          {shifts.map((shift) => (
            <div key={shift.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
              <div className="grid gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm font-medium text-foreground">{shift.name}</strong>
                  {isOvernight(shift.start, shift.end) && <Badge tone="info">Overnight</Badge>}
                </div>
                <span className="font-mono text-xs text-muted">{shift.start} – {shift.end} · {shiftDuration(shift.start, shift.end)}</span>
              </div>
              <div className="flex items-center gap-3">
                <Toggle checked={shift.active} onCheckedChange={() => onToggle(shift.id)} aria-label={`Toggle ${shift.name} shift`} />
                <Button variant="outline" size="sm" onClick={() => onEdit(shift)}>Edit</Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon="clock"
          title="No shifts configured"
          description="Add the first operating window used by filters and reports."
          action={<Button size="sm" onClick={onAdd}>Add shift</Button>}
        />
      )}
    </SettingsSectionShell>
  )
}
