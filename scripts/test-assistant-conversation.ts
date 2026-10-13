import { AssistantConversation, assistantStarterPrompts, type ConversationApi, type ConversationMessage } from '../src/features/ai/assistantConversation.ts'
import { AiServiceError } from '../src/features/ai/aiService.ts'
import { asOf, assert, dataset, equal, id, incident, scope } from '../supabase/functions/safety-intelligence/fixtures_test.ts'
import { calculateSafetySnapshot } from '../supabase/functions/_shared/safetyIntelligenceCalculations.ts'

const session = (n = 800) => ({
  id: id(n), title: 'New chat', created_at: asOf.toISOString(), updated_at: asOf.toISOString(),
  expires_at: '2026-11-05T12:00:00.000Z',
})
const message = (n: number, role: 'user' | 'assistant', content: string): ConversationMessage => ({
  id: n, request_id: id(900), role, content, status: 'succeeded', created_at: asOf.toISOString(),
})
function fixture() {
  const saved = new Map<string, string>()
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => { saved.set(key, value) },
    removeItem: (key: string) => { saved.delete(key) },
  }
  let creates = 0
  const sends: string[] = []
  let messages: ConversationMessage[] = []
  const api: ConversationApi = {
    list: () => Promise.resolve([session()]),
    create: () => Promise.resolve(session(800 + creates++)),
    read: (selected) => Promise.resolve({ session: { ...session(), id: selected }, messages }),
    send: (selected, prompt) => {
      sends.push(selected)
      messages = [message(1, 'user', prompt), message(2, 'assistant', 'Authorized advisory response')]
      return Promise.resolve({
        ok: true, contractVersion: '1', requestId: id(900), feature: 'safety_copilot',
        promptVersion: 'safety-copilot-grounded-v1', model: 'test-model', sessionId: selected,
        content: { origin: 'ai_generated', authoritative: false, text: 'Authorized advisory response' }, citations: [],
      })
    },
  }
  return { storage, saved, api, sends, creates: () => creates,
    controller: () => new AssistantConversation(api, storage, 'tenant:user', () => asOf.getTime()) }
}

Deno.test('conversation creates, sends and continues within persisted selected session; New Chat is distinct', async () => {
  const test = fixture()
  const chat = test.controller()
  chat.setDraft('First question')
  await chat.send()
  equal(test.creates(), 1)
  equal(chat.getSnapshot().messages.length, 2)
  equal(chat.getSnapshot().draft, '')
  chat.setDraft('Follow-up')
  await chat.send()
  equal(test.sends, [id(800), id(800)])
  equal(test.creates(), 1)
  await chat.newChat()
  equal(chat.getSnapshot().selectedId, id(801))
  equal(chat.getSnapshot().messages, [])
  equal(test.saved.get('tenant:user'), id(801))
})

Deno.test('refresh restores selected history and explicit reopen changes conversation without permanent memory', async () => {
  const test = fixture()
  const first = test.controller()
  first.setDraft('Question')
  await first.send()
  first.dispose()
  const reopened = test.controller()
  await reopened.load()
  equal(reopened.getSnapshot().selectedId, id(800))
  equal(reopened.getSnapshot().messages.length, 2)
  await reopened.open(id(801))
  equal(test.saved.get('tenant:user'), id(801))
  assert([...test.saved.values()].every((value) => !value.includes('Question')), 'Browser persisted message text')
})

Deno.test('current-access recheck clears previously loaded transcript before a denied refresh', async () => {
  const test = fixture()
  const chat = test.controller()
  chat.setDraft('Authorized question')
  await chat.send()
  equal(chat.getSnapshot().messages.length, 2)
  let rejectRead: (error: Error) => void = () => { throw new Error('Read not started') }
  test.api.read = () => new Promise((_resolve, reject) => { rejectRead = reject })
  const reload = chat.load()
  equal(chat.getSnapshot().messages, [])
  await Promise.resolve()
  rejectRead(new Error('Conversation access changed. Start a new chat.'))
  await reload
  equal(chat.getSnapshot().messages, [])
  equal(chat.getSnapshot().selectedId, null)
  equal(chat.getSnapshot().stopped, true)
  assert(chat.getSnapshot().error?.includes('access changed'), 'Revocation failed silently')
})

Deno.test('access-denied send hides an already loaded answer instead of keeping stale transcript', async () => {
  const test = fixture()
  const chat = test.controller()
  chat.setDraft('First question')
  await chat.send()
  test.api.send = () => Promise.reject(new AiServiceError({
    ok: false, contractVersion: '1', requestId: id(901),
    error: { code: 'access_denied', message: 'Conversation access changed', retryable: false },
  }))
  chat.setDraft('Continue')
  await chat.send()
  equal(chat.getSnapshot().messages, [])
  equal(chat.getSnapshot().stopped, true)
})

Deno.test('failed sends preserve drafts and traceable error; limits and conflict are explicit', async () => {
  for (const code of ['provider_error', 'conflict', 'session_limit', 'access_denied'] as const) {
    const test = fixture()
    test.api.send = () => Promise.reject(new AiServiceError({
      ok: false, contractVersion: '1', requestId: id(901),
      error: { code, message: 'Safe failure', retryable: code === 'provider_error' || code === 'conflict' },
    }))
    const chat = test.controller()
    chat.setDraft('Keep this question')
    await chat.send()
    equal(chat.getSnapshot().draft, 'Keep this question')
    assert(chat.getSnapshot().error?.includes(id(901)), 'Failure lost its request trace')
    equal(chat.getSnapshot().messages, [])
    equal(chat.getSnapshot().stopped, code === 'session_limit' || code === 'access_denied')
    equal(chat.getSnapshot().busy, false)
  }
})

Deno.test('local lock prevents concurrent send/new-chat/open while provider work is active', async () => {
  const test = fixture()
  const original = test.api.send
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  test.api.send = async (selected, prompt) => { await gate; return original(selected, prompt) }
  const chat = test.controller()
  chat.setDraft('Single request')
  const pending = chat.send()
  await chat.send()
  await chat.newChat()
  await chat.open(id(999))
  equal(test.creates(), 1)
  release()
  await pending
  equal(test.sends.length, 1)
})

Deno.test('expired, capped and pending conversations block sends; inaccessible saved IDs do not reveal history', async () => {
  for (const reason of ['expired', 'limit', 'pending', 'missing']) {
    const test = fixture()
    test.saved.set('tenant:user', id(800))
    test.api.list = () => Promise.resolve(reason === 'missing' ? [] : [session()])
    test.api.read = () => reason === 'missing' ? Promise.reject(new Error('AI conversation is not accessible.')) : Promise.resolve({
      session: { ...session(), ...(reason === 'expired' ? { expires_at: '2026-10-01T12:00:00.000Z' } : {}) },
      messages: reason === 'limit' ? Array.from({ length: 99 }, (_, index) => message(index + 1, 'user', 'Existing'))
        : reason === 'pending' ? [{ ...message(1, 'user', 'Existing'), status: 'pending' }] : [],
    })
    const chat = test.controller()
    await chat.load()
    assert(chat.getSnapshot().error, 'Missing lifecycle explanation')
    if (reason === 'missing') {
      equal(chat.getSnapshot().messages, [])
      equal(test.saved.size, 0)
    } else {
      chat.setDraft('Do not send')
      await chat.send()
      equal(test.sends.length, 0)
    }
  }
})

Deno.test('tenant/user selections are isolated; late disposed results cannot populate another identity', async () => {
  const test = fixture()
  test.saved.set('tenant:user', id(800))
  const other = new AssistantConversation(test.api, test.storage, 'other-tenant:other-user', () => asOf.getTime())
  await other.load()
  equal(other.getSnapshot().selectedId, null)
  let release!: () => void
  test.api.read = async () => {
    await new Promise<void>((resolve) => { release = resolve })
    return { session: session(), messages: [message(1, 'assistant', 'Private text')] }
  }
  const old = test.controller()
  const pending = old.open(id(800))
  old.dispose()
  release()
  await pending
  equal(old.getSnapshot().messages, [])
  equal(other.getSnapshot().messages, [])
})

Deno.test('storage failures are visible; successful sends with failed refresh cannot encourage duplicate generation', async () => {
  const test = fixture()
  const chat = new AssistantConversation(test.api, {
    ...test.storage, setItem: () => { throw new Error('Denied') },
  }, 'tenant:user', () => asOf.getTime())
  await chat.newChat()
  assert(chat.getSnapshot().storageError, 'Storage failure silently hidden')
  test.api.read = () => Promise.reject(new Error('Read failed'))
  chat.setDraft('Question')
  await chat.send()
  equal(chat.getSnapshot().draft, '')
  assert(chat.getSnapshot().error?.includes('do not resend'), 'Ambiguous success encouraged retry')
})

Deno.test('starter prompts use actual authorized location names or honest generic suggestions', () => {
  const generic = assistantStarterPrompts()
  equal(generic.length, 5)
  assert(generic.some((prompt) => prompt.includes('authorized sites')), 'Generic fallback missing')
  const snapshot = calculateSafetySnapshot(dataset([incident(0)]), scope, { days: 90 }, asOf)
  const prompts = assistantStarterPrompts(snapshot)
  assert(prompts.some((prompt) => prompt.includes('Fixture Site')), 'Actual site not used')
  assert(prompts.every((prompt) => !prompt.includes('Refinery')), 'Placeholder location invented')
})

Deno.test('abandoned pending turns can recover after the server lock and Strict Mode reloading stays usable', async () => {
  const test = fixture()
  test.saved.set('tenant:user', id(800))
  test.api.read = () => Promise.resolve({
    session: session(), messages: [{ ...message(1, 'user', 'Old pending'),
      status: 'pending', created_at: '2026-10-06T11:57:00.000Z' }],
  })

  const chat = test.controller()
  const initial = chat.load()
  chat.dispose()
  await chat.load()
  await initial
  equal(chat.getSnapshot().loading, false)
  equal(chat.getSnapshot().stopped, false)
  assert(chat.getSnapshot().error?.includes('recover abandoned'), 'Abandoned state not explained')
  chat.setDraft('Next question')
  await chat.send()
  equal(test.sends.length, 1)
})

Deno.test('selection outside the bounded recent list still restores through authorized session retrieval', async () => {
  const test = fixture()
  test.api.list = () => Promise.resolve([])
  test.saved.set('tenant:user', id(800))
  const chat = test.controller()
  await chat.load()
  equal(chat.getSnapshot().selectedId, id(800))
  equal(chat.getSnapshot().error, null)
  equal(chat.getSnapshot().sessions[0].id, id(800))
})
