/** Trigger a browser download for an in-memory blob and release the object URL. */
export function downloadExport(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

/** Shared export filename shape: SentinelQHSE_<prefix>_<yyyy-mm-dd>.<format>. */
export function buildExportFileName(prefix: string, format: string, date: Date) {
  return `SentinelQHSE_${prefix}_${date.toISOString().slice(0, 10)}.${format}`
}