// Company-settings filter option builders shared by the Dashboard and
// Executive Analytics so both surfaces offer the same departments, shifts and
// severities instead of deriving them from unrelated data.

export type CompanyShift = { name: string; start: string; end: string; active: boolean }

export function buildShiftSettings(value: unknown): CompanyShift[] {
  const candidate = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).shifts) ? (value as Record<string, unknown>).shifts as unknown[] : []
  return candidate.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name || item.active === false) return []
    return [{ name, start: typeof item.start === 'string' ? item.start : '07:00', end: typeof item.end === 'string' ? item.end : '19:00', active: true }]
  })
}

export function buildShiftOptions(value: unknown): string[] {
  return ['all', ...buildShiftSettings(value).map((shift) => shift.name)]
}

export function buildDepartmentOptions(value: unknown): string[] {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as Record<string, unknown>).items as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).departments as unknown[] | undefined)
        ?? []
      : []
  const names = candidate.flatMap((entry) => {
    const rawName = typeof entry === 'string' ? entry : entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).name === 'string' ? (entry as Record<string, unknown>).name as string : ''
    if (!rawName || (typeof entry === 'object' && entry !== null && 'active' in entry && (entry as Record<string, unknown>).active === false)) return []
    return rawName.trim() ? [rawName.trim()] : []
  })
  return ['all', ...names]
}

export function buildSeverityOptions(value: unknown): string[] {
  const candidate = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? ((value as Record<string, unknown>).items as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).levels as unknown[] | undefined)
        ?? ((value as Record<string, unknown>).severity_levels as unknown[] | undefined)
        ?? []
      : []

  const names = candidate.flatMap((entry) => {
    if (typeof entry === 'string') {
      const name = entry.trim()
      return name && name !== 'all' ? [name] : []
    }
    if (!entry || typeof entry !== 'object') return []
    const item = entry as Record<string, unknown>
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    return name && name.toLowerCase() !== 'all' && item.active !== false ? [name] : []
  })

  return ['all', ...names]
}