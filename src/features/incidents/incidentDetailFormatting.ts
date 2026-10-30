export function formatLabel(value: string | null) {
  return value
    ? value
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase())
    : 'Not available'
}

export function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not available'
}

export function elapsedSince(value: string, now: number) {
  const elapsedMinutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000))
  const days = Math.floor(elapsedMinutes / 1440)
  const hours = Math.floor((elapsedMinutes % 1440) / 60)
  const minutes = elapsedMinutes % 60
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
