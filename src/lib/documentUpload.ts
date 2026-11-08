const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
}

export const SUPPORTED_DOCUMENT_MIME_TYPES = [...new Set(Object.values(MIME_TYPES_BY_EXTENSION))]
export const DOCUMENT_UPLOAD_MAX_BYTES = 20 * 1024 * 1024
export const DOCUMENT_UPLOAD_ACCEPT = [
  ...Object.keys(MIME_TYPES_BY_EXTENSION).map((extension) => `.${extension}`),
  ...SUPPORTED_DOCUMENT_MIME_TYPES,
].join(',')

export function getDocumentUploadMimeType(file: File): string {
  if (file.size < 1 || file.size > DOCUMENT_UPLOAD_MAX_BYTES) {
    throw new Error('Supporting documents must be between 1 byte and 20 MB.')
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const extensionMimeType = MIME_TYPES_BY_EXTENSION[extension]
  if (extensionMimeType) return extensionMimeType

  if (SUPPORTED_DOCUMENT_MIME_TYPES.includes(file.type)) return file.type
  throw new Error('Choose a supported image, document, spreadsheet, presentation, or text file.')
}
