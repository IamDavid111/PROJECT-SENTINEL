import { createClient } from '@supabase/supabase-js'

const url = Deno.env.get('LOCAL_SUPABASE_URL') ?? ''
if (url !== 'http://127.0.0.1:54321') throw new Error('This smoke test is restricted to local Supabase.')
const admin = createClient(url, Deno.env.get('LOCAL_SERVICE_KEY') ?? '', { auth: { persistSession: false } })
const anon = Deno.env.get('LOCAL_ANON_KEY') ?? ''
const users: string[] = [], organizations: string[] = [], paths: string[] = []
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
function unwrap<T extends { data: unknown; error: { message: string } | null }>(result: T): T['data'] {
  if (result.error) throw new Error(result.error.message)
  return result.data
}
async function account(org: string, role: string) {
  const password = crypto.randomUUID() + 'aA1!'
  const user = unwrap(await admin.auth.admin.createUser({
    email: `extraction-smoke-${crypto.randomUUID()}@example.com`, password, email_confirm: true,
  })).user!
  users.push(user.id)
  unwrap(await admin.from('profiles').insert({ id: user.id, organization_id: org, full_name: 'Extraction local smoke', account_status: 'active' }))
  unwrap(await admin.from('memberships').insert({ user_id: user.id, organization_id: org, role }))
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const session = unwrap(await client.auth.signInWithPassword({ email: user.email!, password })).session!
  return { client, id: user.id, token: session.access_token }
}
async function organization() {
  const org = crypto.randomUUID()
  unwrap(await admin.from('organizations').insert({
    id: org, company_code: `EXT_${org.slice(0,8).toUpperCase()}`, company_name: 'Local extraction smoke test',
    industry: 'Testing', company_size: '1-10', country: 'Nigeria', state: 'Lagos',
    contact_email: 'local-smoke@example.com', contact_phone: '12345678',
  }))
  organizations.push(org)
  return org
}
async function call(token: string, versionId: string, action = 'extract') {
  return await fetch(`${url}/functions/v1/knowledge-extraction`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, versionId }), signal: AbortSignal.timeout(90_000),
  })
}

// Check routing before creating fixtures; do not retry a processing POST after a gateway error.
const readiness = await call('', '00000000-0000-4000-8000-000000000000')
const readinessBody = await readiness.text()
check(readiness.status === 401 && readinessBody.includes('"authentication"'),
  `Local extraction endpoint is not ready: HTTP ${readiness.status}. Wait for Edge runtime startup before running this test.`)

try {
  const org = await organization(), otherOrg = await organization()
  const manager = await account(org, 'QHSE Manager')
  const worker = await account(org, 'Field Worker')
  const other = await account(otherOrg, 'QHSE Manager')
  const source = 'REAL APPROVED DOCUMENT\nEmergency control: isolate the energy source before maintenance.'
  const { Document, Packer, Paragraph } = await import('npm:docx@9.7.1')
  const docx = new Uint8Array(await Packer.toBuffer(new Document({
    sections: [{ children: source.split('\n').map(line => new Paragraph(line)) }],
  })))
  const document = unwrap(await manager.client.from('knowledge_documents').insert({}).select('id').single())
  check(document, 'Document insert did not return a record')
  const documentId = document.id
  async function version(number: number, bytes: Uint8Array, name: string, mime: string, approve: boolean, targetDocumentId = documentId) {
    const id = crypto.randomUUID(), path = `${org}/${targetDocumentId}/${id}/${name}`
    unwrap(await manager.client.from('knowledge_document_versions').insert({
      id, document_id: targetDocumentId, version_number: number, document_type: 'procedure', title: 'Real local approved document',
      storage_path: path, original_filename: name, mime_type: mime, file_size: bytes.length,
    }))
    unwrap(await admin.storage.from('qhse-knowledge').upload(path, bytes, { contentType: mime }))
    paths.push(path)
    unwrap(await admin.from('knowledge_document_versions').update({ uploaded_at: new Date().toISOString() }).eq('id',id))
    if (approve) {
      unwrap(await manager.client.rpc('transition_knowledge_version', { target_version_id: id, target_status: 'pending_review' }))
      unwrap(await manager.client.rpc('transition_knowledge_version', { target_version_id: id, target_status: 'approved' }))
    }
    return id
  }
  const id = await version(1, docx, 'real.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', true)
  const before = unwrap(await admin.from('knowledge_document_versions').select('*').eq('id',id).single())
  const pending = call(manager.token, id)
  let observedProcessing = false
  for (let n=0; n<100; n++) {
    const row = unwrap(await admin.from('knowledge_extractions').select('status').eq('version_id',id).maybeSingle())
    if (row?.status === 'processing') { observedProcessing = true; break }
    if (row?.status === 'succeeded' || row?.status === 'failed') break
    await new Promise(resolve=>setTimeout(resolve,100))
  }
  const response = await pending
  const responseBody = await response.text()
  check(responseBody.length > 0, `Extraction runtime returned HTTP ${response.status} with an empty body`)
  const payload = JSON.parse(responseBody)
  check(response.status === 200, `Real DOCX extraction failed: ${JSON.stringify(payload)}`)
  const extraction = unwrap(await admin.from('knowledge_extractions').select('*').eq('version_id',id).single())
  check(extraction.status === 'succeeded', 'Result did not become succeeded')
  check(extraction.extracted_text.includes('isolate the energy source'), 'Actual document text was not extracted')
  check(extraction.document_id === document.id && extraction.version_id === id, 'Version relation changed')
  check(!JSON.stringify(payload).includes(source) && !('extracted_text' in payload), 'Private text leaked in response')
  const after = unwrap(await admin.from('knowledge_document_versions').select('*').eq('id',id).single())
  check(JSON.stringify(before) === JSON.stringify(after), 'Source version was altered by extraction')
  const events = unwrap(await admin.from('activity_logs').select('metadata').eq('organization_id',org))
  check(events, 'Audit query did not return records')
  check(events.some(e=>e.metadata.event_code==='knowledge_extraction_started') &&
    events.some(e=>e.metadata.event_code==='knowledge_extraction_succeeded'), 'Processing audit transitions missing')
  console.log(`PASS: real uploaded approved DOCX -> actual text; processing -> succeeded${observedProcessing ? ' (processing observed live)' : ' (transition verified in audit)'}`)
  console.log('PASS: source version unchanged, version relationship preserved, no private response content')

  for (const actor of [worker, other]) {
    const denied = await call(actor.token,id)
    check(denied.status===403, 'Unauthorized actor was allowed to process')
  }
  check((await call('',id)).status===401, 'Anonymous extraction allowed')
  const draft = await version(2,new TextEncoder().encode('Draft secret'),'draft.txt','text/plain',false)
  check((await call(manager.token,draft)).status===409, 'Draft extraction allowed')
  unwrap(await manager.client.rpc('transition_knowledge_version',{target_version_id:draft,target_status:'pending_review'}))
  unwrap(await manager.client.rpc('transition_knowledge_version',{target_version_id:draft,target_status:'rejected',reason:'Local test rejection'}))
  check((await call(manager.token,draft)).status===409, 'Rejected extraction allowed')
  console.log('PASS: ordinary reader, other-org manager, anonymous, draft and rejected processing denied')

  const corruptDocument = unwrap(await manager.client.from('knowledge_documents').insert({}).select('id').single())
  check(corruptDocument, 'Corrupt-document insert did not return a record')
  const corrupt = await version(1,new TextEncoder().encode('not a valid Word archive'),'corrupt.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',true,corruptDocument.id)
  const failed = await call(manager.token,corrupt)
  check(failed.status===422, 'Corrupt document did not report failure')
  const status = await (await call(manager.token,corrupt,'status')).json()
  check(status.processing.status==='failed' && status.processing.error_code==='invalid_document', 'Safe failure status missing')
  const failedRow = unwrap(await admin.from('knowledge_extractions').select('extracted_text').eq('version_id',corrupt).single())
  check(failedRow, 'Failed extraction did not return a record')
  check(failedRow.extracted_text===null, 'Failure fabricated extracted text')
  console.log('PASS: corrupt approved file -> failed; safe failure visible via status API; no fabricated text')
} finally {
  if (paths.length) unwrap(await admin.storage.from('qhse-knowledge').remove(paths))
  for (const id of users) unwrap(await admin.from('profiles').delete().eq('id',id))
  for (const id of organizations) unwrap(await admin.from('organizations').delete().eq('id',id))
  for (const id of users) unwrap(await admin.auth.admin.deleteUser(id))
  console.log('Local smoke fixtures removed.')
}
