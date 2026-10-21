/// <reference lib="dom" />
/// <reference types="npm:vite@8.2.2/client" />

import { createClient } from '@supabase/supabase-js'
import { currentKnowledgeVersion, formatFileSize } from '../src/features/knowledge/knowledgeFormat.ts'
import { resolveKnowledgeMimeType } from '../src/features/knowledge/knowledgeFiles.ts'
import { approveAndProcessKnowledgeVersion, KnowledgeServiceError } from '../src/features/knowledge/knowledgeService.ts'

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

function approvalClient(options: { approvalDenied?: boolean; processingFailed?: boolean } = {}) {
  const calls: Array<{ service: string; action: string; versionId: string }> = []
  const version = {
    id: 'version-1', document_id: 'document-1', version_number: 1,
    document_type: 'procedure', title: 'Approved procedure', description: null,
    site_id: null, department: null, owner_id: 'owner-1', effective_date: null,
    review_date: null, expiry_date: null, approval_status: 'approved',
    approved_at: '2026-10-21T12:00:00Z', rejected_at: null, rejection_reason: null,
    confidentiality: 'internal', access_scope: 'organization', original_filename: 'procedure.txt',
    mime_type: 'text/plain', file_size: 18, uploaded_at: '2026-10-21T11:00:00Z',
    created_at: '2026-10-21T11:00:00Z', updated_at: '2026-10-21T12:00:00Z',
  }
  const client = createClient('https://knowledge.invalid', 'test-public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const service = new URL(input instanceof Request ? input.url : String(input)).pathname.split('/').at(-1)
        const body = JSON.parse(String(init?.body))
        calls.push({ service: service ?? '', action: body.action, versionId: body.versionId })
        if (service === 'knowledge-service') {
          return new Response(JSON.stringify(options.approvalDenied
            ? { ok: false, requestId: 'approval-request', error: { message: 'Approval permission is required.' } }
            : { ok: true, version }), {
            status: options.approvalDenied ? 403 : 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (service === 'knowledge-extraction') {
          return new Response(JSON.stringify(options.processingFailed
            ? { ok: false, requestId: 'processing-request', error: { message: 'Document indexing could not be completed.' } }
            : { ok: true, chunksAdded: 1, indexedChunks: 1 }), {
            status: options.processingFailed ? 503 : 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        throw new Error(`Unexpected service: ${service}`)
      },
    },
  })
  return { client, calls }
}

Deno.test('approval hands the same version to AI processing only after approval succeeds', async () => {
  const { client, calls } = approvalClient()
  equal(await approveAndProcessKnowledgeVersion(client, 'version-1'), 'Version approved and processed for AI knowledge.')
  equal(JSON.stringify(calls), JSON.stringify([
    { service: 'knowledge-service', action: 'approve', versionId: 'version-1' },
    { service: 'knowledge-extraction', action: 'extract', versionId: 'version-1' },
  ]))
})

Deno.test('denied approval reports the API error and never starts AI processing', async () => {
  const { client, calls } = approvalClient({ approvalDenied: true })
  let failure: unknown
  try {
    await approveAndProcessKnowledgeVersion(client, 'version-1')
  } catch (error) {
    failure = error
  }
  equal(failure instanceof KnowledgeServiceError, true)
  if (!(failure instanceof KnowledgeServiceError)) throw new Error('Expected an approval service error.')
  equal(failure.message, 'Approval permission is required.')
  equal(failure.requestId, 'approval-request')
  equal(calls.length, 1)
})

Deno.test('AI processing failure is distinguished from a failed approval without re-approving', async () => {
  const { client, calls } = approvalClient({ processingFailed: true })
  equal(await approveAndProcessKnowledgeVersion(client, 'version-1'),
    'Version approved, but AI knowledge processing failed: Document indexing could not be completed.')
  equal(calls.length, 2)
  equal(calls.filter((call) => call.action === 'approve').length, 1)
})
