import { handleKnowledgeRequest, type KnowledgeRuntime } from './handler.ts'
import { knowledgeRequestSchema, requiredKnowledgePermission } from './contracts.ts'

const userId = 'bc000000-0000-4000-8000-000000000001'
const organizationId = 'bd000000-0000-4000-8000-000000000001'

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// Mirrors the database defaults; 'Uploader' stands in for a custom role granted only manage rights.
const roleCapabilities: Record<string, Record<string, boolean>> = {
  'QHSE Manager': { canView: true, canManage: true, canApprove: true, canViewConfidential: true, canViewRestricted: true },
  Uploader: { canView: true, canManage: true, canApprove: false },
  'Field Worker': { canView: true },
}

function runtime(role: string, requests: Array<{ url: URL; init?: RequestInit }> = []): KnowledgeRuntime {
  return {
    env: (name) => ({
      SUPABASE_URL: 'https://knowledge-test.invalid',
      SUPABASE_ANON_KEY: 'test-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
    })[name],
    fetch: (input, init) => Promise.resolve().then(() => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      requests.push({ url, init })
      if (url.pathname.endsWith('/auth/v1/user')) return json({ id: userId })
      if (url.pathname.endsWith('/rest/v1/rpc/current_knowledge_capabilities')) {
        return json(roleCapabilities[role] ?? {})
      }
      if (url.pathname.endsWith('/rest/v1/profiles')) {
        return json({ id: userId, organization_id: organizationId, account_status: 'active' })
      }
      if (url.pathname.endsWith('/rest/v1/memberships')) {
        return json({ user_id: userId, organization_id: organizationId, role })
      }
      if (url.pathname.endsWith('/rest/v1/knowledge_documents')) {
        const inserted = JSON.parse(String(init?.body)) as Record<string, unknown>
        return json({
          id: 'bf000000-0000-4000-8000-000000000001',
          lifecycle_status: 'active',
          archived_at: null,
          created_by: inserted.created_by,
          created_at: '2026-10-06T00:00:00Z',
          updated_at: '2026-10-06T00:00:00Z',
        }, 201)
      }
      throw new Error(`Unexpected request: ${url.pathname}`)
    }),
  }
}

function request(body?: unknown, authorization = 'Bearer trusted-user-token') {
  return new Request('https://knowledge-test.invalid/functions/v1/knowledge-service', {
    method: 'POST',
    headers: {
      ...(authorization ? { Authorization: authorization } : {}),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? '{}' : JSON.stringify(body),
  })
}

Deno.test('approval actions require approve permission and other writes require manage permission', () => {
  assertEquals(requiredKnowledgePermission('approve'), 'canApprove')
  assertEquals(requiredKnowledgePermission('reject'), 'canApprove')
  for (const action of ['create_document', 'prepare_upload', 'update_metadata', 'submit_for_approval', 'archive', 'restore'] as const) {
    assertEquals(requiredKnowledgePermission(action), 'canManage')
  }
  for (const action of ['list_documents', 'get_document', 'download'] as const) {
    assertEquals(requiredKnowledgePermission(action), null)
  }
})

Deno.test('a custom uploader role without approve permission cannot approve', async () => {
  const seen: Array<{ url: URL; init?: RequestInit }> = []
  const response = await handleKnowledgeRequest(
    request({ action: 'approve', versionId: 'c0000000-0000-4000-8000-000000000001' }),
    runtime('Uploader', seen),
  )
  assertEquals(response.status, 403)
  assertEquals(seen.some(({ url }) => url.pathname.endsWith('/rest/v1/knowledge_document_versions')), false)
})

Deno.test('upload registration rejects unsupported MIME types and files over the bucket limit', () => {
  const common = {
    action: 'prepare_upload',
    documentId: 'bf000000-0000-4000-8000-000000000001',
    documentType: 'procedure',
    title: 'Emergency procedure',
    originalFilename: 'emergency.pdf',
  }
  assertEquals(knowledgeRequestSchema.safeParse({
    ...common, mimeType: 'application/octet-stream', fileSize: 100,
  }).success, false)
  assertEquals(knowledgeRequestSchema.safeParse({
    ...common, mimeType: 'application/pdf', fileSize: 104857601,
  }).success, false)
  assertEquals(knowledgeRequestSchema.safeParse({
    ...common, mimeType: 'application/pdf', fileSize: 100,
  }).success, true)
})

Deno.test('knowledge service rejects anonymous callers before database access', async () => {
  const seen: Array<{ url: URL; init?: RequestInit }> = []
  const response = await handleKnowledgeRequest(request(undefined, ''), runtime('QHSE Manager', seen))
  assertEquals(response.status, 401)
  assertEquals(seen.length, 0)
})

Deno.test('ordinary users cannot create documents and no write reaches Supabase', async () => {
  const seen: Array<{ url: URL; init?: RequestInit }> = []
  const response = await handleKnowledgeRequest(
    request({ action: 'create_document' }),
    runtime('Field Worker', seen),
  )
  assertEquals(response.status, 403)
  assertEquals(seen.some(({ url }) => url.pathname.endsWith('/rest/v1/knowledge_documents')), false)
})

Deno.test('organization and user identity in the body are rejected rather than trusted', async () => {
  const response = await handleKnowledgeRequest(
    request({ action: 'create_document', organization_id: 'foreign-org', user_id: 'foreign-user' }),
    runtime('QHSE Manager'),
  )
  assertEquals(response.status, 400)
})

Deno.test('document creation derives tenant context from authenticated profile', async () => {
  const seen: Array<{ url: URL; init?: RequestInit }> = []
  const response = await handleKnowledgeRequest(
    request({ action: 'create_document' }),
    runtime('QHSE Manager', seen),
  )
  assertEquals(response.status, 201)
  const insert = seen.find(({ url }) => url.pathname.endsWith('/rest/v1/knowledge_documents'))
  assertEquals(new Headers(insert?.init?.headers).get('authorization'), 'Bearer trusted-user-token')
  assertEquals(JSON.parse(String(insert?.init?.body)), {
    organization_id: organizationId,
    created_by: userId,
  })
  assertEquals(seen.some(({ init }) => new Headers(init?.headers).get('apikey') === 'test-service-role'), false)
})

Deno.test('list returns server-computed capabilities and the latest caller-visible version', async () => {
  const documentId = 'bf000000-0000-4000-8000-000000000002'
  const seen: Array<{ url: URL; init?: RequestInit }> = []
  const base = runtime('Field Worker', seen)
  let versions = [
    { id: 'v2', document_id: documentId, version_number: 2, title: 'Newest visible', approval_status: 'rejected' },
    { id: 'v1', document_id: documentId, version_number: 1, title: 'Older', approval_status: 'approved' },
  ]
  const listRuntime: KnowledgeRuntime = {
    env: base.env,
    fetch: (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      if (url.pathname.endsWith('/rest/v1/knowledge_documents')) {
        seen.push({ url, init })
        return Promise.resolve(json([{ id: documentId, lifecycle_status: 'active', archived_at: null,
          created_by: userId, created_at: '2026-10-06T00:00:00Z', updated_at: '2026-10-06T00:00:00Z' }]))
      }
      if (url.pathname.endsWith('/rest/v1/knowledge_document_versions')) {
        seen.push({ url, init })
        return Promise.resolve(json(versions))
      }
      return base.fetch(input, init)
    },
  }
  const response = await handleKnowledgeRequest(request({ action: 'list_documents' }), listRuntime)
  assertEquals(response.status, 200)
  const body = await response.json()
  assertEquals(body.capabilities, { canView: true, canManage: false, canApprove: false, canViewConfidential: false, canViewRestricted: false })
  assertEquals(body.documents[0].latestVersion.id, 'v2')
  assertEquals(body.documents[0].currentVersion.id, 'v1')
  for (const status of ['draft', 'pending_review']) {
    versions[0].approval_status = status
    const replacement = await handleKnowledgeRequest(request({ action: 'list_documents' }), listRuntime)
    assertEquals((await replacement.json()).documents[0].currentVersion.id, 'v1')
  }
  versions[0].approval_status = 'approved'
  versions[1].approval_status = 'superseded'
  const approved = await handleKnowledgeRequest(request({ action: 'list_documents' }), listRuntime)
  assertEquals((await approved.json()).documents[0].currentVersion.id, 'v2')
  versions = [versions[0]]
  versions[0].approval_status = 'draft'
  const noApproval = await handleKnowledgeRequest(request({ action: 'list_documents' }), listRuntime)
  assertEquals((await noApproval.json()).documents[0].currentVersion.id, 'v2')
  versions = []
  const noVersions = await handleKnowledgeRequest(request({ action: 'list_documents' }), listRuntime)
  const empty = (await noVersions.json()).documents[0]
  assertEquals(empty.currentVersion, null)
  assertEquals(empty.latestVersion, null)
  const versionRead = seen.find(({ url }) => url.pathname.endsWith('/rest/v1/knowledge_document_versions'))
  assertEquals(versionRead?.url.searchParams.get('organization_id'), `eq.${organizationId}`)
  assertEquals(seen.some(({ init }) => new Headers(init?.headers).get('apikey') === 'test-service-role'), false)
})

Deno.test('lifecycle actions use caller-authenticated RPCs without client status-table writes', async () => {
  const versionId = 'bf000000-0000-4000-8000-000000000002'
  for (const [action, status] of [
    ['submit_for_approval', 'pending_review'], ['approve', 'approved'], ['reject', 'rejected'],
    ['archive', 'archived'], ['restore', 'active'],
  ] as const) {
    const seen: Array<{ url: URL; init?: RequestInit }> = []
    const base = runtime('QHSE Manager', seen)
    const isDocument = action === 'archive' || action === 'restore'
    const rpc = isDocument ? 'transition_knowledge_document' : 'transition_knowledge_version'
    const actionRuntime: KnowledgeRuntime = {
      env: base.env,
      fetch: (input, init) => {
        const url = new URL(String(input instanceof Request ? input.url : input))
        if (url.pathname.endsWith(`/rpc/${rpc}`)) {
          seen.push({ url, init })
          return Promise.resolve(json({ id: versionId }))
        }
        return base.fetch(input, init)
      },
    }
    const response = await handleKnowledgeRequest(request({
      action,
      ...(isDocument ? { documentId: versionId } : { versionId }),
      ...(action === 'reject' ? { reason: 'Needs correction' } : {}),
    }), actionRuntime)
    assertEquals(response.status, 200)
    const call = seen.find(({ url }) => url.pathname.endsWith(`/rpc/${rpc}`))
    assertEquals(JSON.parse(String(call?.init?.body)), isDocument
      ? { target_document_id: versionId, target_lifecycle: status }
      : { target_version_id: versionId, target_status: status, reason: action === 'reject' ? 'Needs correction' : null })
    assertEquals(seen.some(({ url }) => /\/rest\/v1\/knowledge_(documents|document_versions)$/.test(url.pathname)), false)
    assertEquals(seen.some(({ init }) => new Headers(init?.headers).get('apikey') === 'test-service-role'), false)
  }
})

Deno.test('lifecycle request contracts reject forged status and approval evidence', () => {
  for (const extra of [
    { approval_status: 'approved' }, { approved_by: userId }, { approved_at: '2026-10-07T00:00:00Z' },
  ]) {
    assertEquals(knowledgeRequestSchema.safeParse({
      action: 'approve', versionId: userId, ...extra,
    }).success, false)
  }
  assertEquals(knowledgeRequestSchema.safeParse({
    action: 'update_metadata', versionId: userId, patch: { approval_status: 'approved' },
  }).success, false)
})
