export const formatLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ')

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Versions are newest-first and already authorized; a rejected replacement never displaces an approval.
export function currentKnowledgeVersion<T extends { approval_status: string }>(versions: readonly T[]): T | null {
  return versions.find((version) => version.approval_status === 'approved') ?? versions[0] ?? null
}
