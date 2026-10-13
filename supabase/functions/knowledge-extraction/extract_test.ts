import { Buffer } from 'node:buffer'
import ExcelJS from 'exceljs'
import { extractDocument, ExtractionError } from './extract.ts'

function assert(value: boolean, message: string) { if (!value) throw new Error(message) }
async function fails(bytes: Uint8Array, mime: string, code: string) {
  try { await extractDocument(bytes, mime) } catch (error) {
    assert(error instanceof ExtractionError && error.code === code, `Expected ${code}`)
    return
  }
  throw new Error('Unexpected extraction success')
}

Deno.test('TXT extracts actual UTF-8 and rejects empty or invalid encoding', async () => {
  assert(await extractDocument(new TextEncoder().encode('Actual safety text'), 'text/plain') === 'Actual safety text', 'Text changed')
  await fails(new TextEncoder().encode('  '), 'text/plain', 'no_extractable_text')
  await fails(new Uint8Array([0xff]), 'text/plain', 'invalid_document')
  await fails(new Uint8Array([1]), 'application/msword', 'unsupported_legacy_doc')
})

Deno.test('XLSX extracts stored values without evaluating formulas and rejects empty workbooks', async () => {
  const w = new ExcelJS.Workbook()
  const sheet = w.addWorksheet('Safety')
  sheet.addRow(['Hazard', 'Control'])
  sheet.addRow(['Fire', 'Extinguisher'])
  sheet.getCell('C2').value = { formula: '1+1', result: 2 }
  const text = await extractDocument(new Uint8Array(await w.xlsx.writeBuffer()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  assert(text.includes('Fire\tExtinguisher\t2'), 'Stored cells not extracted')
  const empty = new ExcelJS.Workbook()
  empty.addWorksheet('Empty')
  await fails(new Uint8Array(await empty.xlsx.writeBuffer()), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'no_extractable_text')
})

Deno.test('DOCX extracts real paragraph text', async () => {
  // Existing project export dependency generates the valid test original.
  const { Document, Packer, Paragraph } = await import('npm:docx@9.7.1')
  const bytes = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Approved operating procedure')] }] }))
  assert((await extractDocument(new Uint8Array(bytes), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).includes('Approved operating procedure'), 'DOCX text missing')
  await fails(Buffer.from('corrupt'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'invalid_document')
})

Deno.test('PDF extracts actual text and reports image-only/empty text explicitly', async () => {
  function pdf(content: string) {
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    ]
    let source = '%PDF-1.4\n'
    const offsets = [0]
    objects.forEach((obj, n) => { offsets.push(source.length); source += `${n+1} 0 obj\n${obj}\nendobj\n` })
    const start = source.length
    source += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`
    return new TextEncoder().encode(source)
  }
  assert((await extractDocument(pdf('BT /F1 12 Tf 20 200 Td (Actual PDF safety text) Tj ET'), 'application/pdf')).includes('Actual PDF safety text'), 'PDF text missing')
  await fails(pdf(''), 'application/pdf', 'no_extractable_text')
  await fails(new TextEncoder().encode('corrupt'), 'application/pdf', 'invalid_document')
})
