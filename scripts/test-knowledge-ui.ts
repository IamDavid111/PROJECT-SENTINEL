import { currentKnowledgeVersion, formatFileSize } from '../src/features/knowledge/knowledgeFormat.ts'
import { resolveKnowledgeMimeType } from '../src/features/knowledge/knowledgeFiles.ts'

function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${expected}, received ${actual}`)
}

Deno.test('document sizes preserve bytes below 1 KB and use readable larger units', () => {
  for (const [size, expected] of [
    [0, '0 B'], [52, '52 B'], [1023, '1023 B'], [1024, '1.0 KB'],
    [1536, '1.5 KB'], [1048576, '1.0 MB'], [104857600, '100.0 MB'],
  ] as const) equal(formatFileSize(size), expected)
})

Deno.test('current controlled version retains approval through replacement workflows', () => {
  const approved = { id: 'v1', approval_status: 'approved' }
  for (const status of ['draft', 'pending_review', 'rejected']) {
    const newer = { id: 'v2', approval_status: status }
    equal(currentKnowledgeVersion([newer, approved]), approved)
    equal(currentKnowledgeVersion([newer]), newer)
  }
  const newApproval = { id: 'v2', approval_status: 'approved' }
  equal(currentKnowledgeVersion([newApproval, { id: 'v1', approval_status: 'superseded' }]), newApproval)
  equal(currentKnowledgeVersion([]), null)
})

Deno.test('Word and Excel uploads support browser MIME types and missing MIME fallback', () => {
  const formats = [
    ['pdf', 'application/pdf'],
    ['doc', 'application/msword'],
    ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['txt', 'text/plain'],
  ]
  for (const [extension, mime] of formats) {
    equal(resolveKnowledgeMimeType(new File(['test'], `test.${extension}`, { type: mime })), mime)
    equal(resolveKnowledgeMimeType(new File(['test'], `test.${extension.toUpperCase()}`)), mime)
  }
  equal(resolveKnowledgeMimeType(new File(['test'], 'test.exe')), null)
  equal(resolveKnowledgeMimeType(new File(['test'], 'test.docx', { type: 'application/octet-stream' })), null)
})
