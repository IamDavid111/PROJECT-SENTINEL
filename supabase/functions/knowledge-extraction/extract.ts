export const maxSourceBytes = 10 * 1024 * 1024
const maxTextBytes = 2_000_000

export class ExtractionError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

function validatedText(text: string) {
  const clean = text.replaceAll('\u0000', '').trim()
  if (!clean) throw new ExtractionError('no_extractable_text', 'No readable text was found. Scanned documents require OCR, which is not supported.')
  if (new TextEncoder().encode(clean).length > maxTextBytes) {
    throw new ExtractionError('text_limit', 'Extracted text exceeds the 2 MB processing limit.')
  }
  return clean
}

function validateOfficeArchive(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = bytes.length - 22
  while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < Math.max(0, bytes.length - 65557)) throw new ExtractionError('invalid_document', 'Office file is not a valid ZIP archive.')
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true), expanded = 0
  if (count > 2000) throw new ExtractionError('archive_limit', 'Office archive has too many entries.')
  for (let n = 0; n < count; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new ExtractionError('invalid_document', 'Office archive directory is invalid.')
    }
    const size = view.getUint32(offset + 24, true)
    if (size === 0xffffffff || (view.getUint16(offset + 8, true) & 1)) {
      throw new ExtractionError('invalid_document', 'Encrypted and ZIP64 Office archives are not supported.')
    }
    expanded += size
    if (expanded > 50 * 1024 * 1024) throw new ExtractionError('archive_limit', 'Office archive exceeds the 50 MB expanded processing limit.')
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }
}

export async function extractDocument(bytes: Uint8Array, mime: string): Promise<string> {
  if (!bytes.length || bytes.length > maxSourceBytes) {
    throw new ExtractionError('source_limit', 'Extraction requires a nonempty file no larger than 10 MB.')
  }
  if (mime === 'application/msword') {
    throw new ExtractionError('unsupported_legacy_doc', 'Legacy DOC extraction is not supported. Upload an approved DOCX replacement.')
  }
  try {
    if (mime === 'text/plain') return validatedText(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      validateOfficeArchive(bytes)
      const mammoth = await import('mammoth')
      // The library's browser bundle avoids a large Node compatibility graph in Edge workers.
      const result = await mammoth.extractRawText({ arrayBuffer: bytes.slice().buffer })
      if (result.messages.some((message: { type: string }) => message.type === 'error')) {
        throw new ExtractionError('invalid_document', 'The Word document could not be read completely.')
      }
      return validatedText(result.value)
    }
    if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      validateOfficeArchive(bytes)
      const { default: ExcelJS } = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(bytes.slice().buffer)
      const lines: string[] = []
      let cells = 0
      let nonempty = false
      workbook.eachSheet((sheet) => {
        lines.push(sheet.name)
        sheet.eachRow((row) => {
          const values: string[] = []
          row.eachCell({ includeEmpty: true }, (cell) => {
            if (++cells > 100_000) throw new ExtractionError('workbook_limit', 'Workbook exceeds the 100,000-cell processing limit.')
            // Only stored cell text/cached values: never execute formulas or external links.
            if (cell.text.trim()) nonempty = true
            values.push(cell.text)
          })
          lines.push(values.join('\t'))
        })
      })
      if (!nonempty) throw new ExtractionError('no_extractable_text', 'Workbook contains no readable cell values.')
      return validatedText(lines.join('\n'))
    }
    if (mime === 'application/pdf') {
      // Bundle the pure-JS text worker; Edge Functions cannot spawn a filesystem worker.
      Object.assign(globalThis, { pdfjsWorker: await import('pdfjs-worker') })
      const pdfjs = await import('pdfjs')
      const task = pdfjs.getDocument({ data: bytes, useSystemFonts: false, isEvalSupported: false, disableFontFace: true })
      try {
        const pdf = await task.promise
        if (pdf.numPages > 500) throw new ExtractionError('page_limit', 'PDF exceeds the 500-page processing limit.')
        const pages: string[] = []
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n)
          const text = await page.getTextContent()
          pages.push(text.items.map((item) => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join(''))
          page.cleanup()
        }
        return validatedText(pages.join('\n'))
      } finally { await task.destroy() }
    }
    throw new ExtractionError('unsupported_format', 'This document format is not supported for extraction.')
  } catch (error) {
    if (error instanceof ExtractionError) throw error
    // Parser exceptions may contain source text or private paths; persist only a safe category.
    throw new ExtractionError('invalid_document', 'Document parsing failed. The file may be corrupt, encrypted or use an unsupported encoding.')
  }
}
