import type { IncidentStatus } from './incidentTypes'

export function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'Not submitted'
}

export function formatDateTime(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not submitted'
}

export function incidentHref(id: string, status: IncidentStatus) {
  return status === 'draft' ? `#report-incident?draft=${id}` : `#incident-detail?id=${id}`
}

export function activeSettingNames(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string') return item.trim() ? [item.trim()] : []
    if (!item || typeof item !== 'object') return []
    const entry = item as { name?: unknown; active?: unknown; deleted?: unknown }
    return typeof entry.name === 'string' && entry.name.trim() && entry.active !== false && entry.deleted !== true ? [entry.name.trim()] : []
  })
}
