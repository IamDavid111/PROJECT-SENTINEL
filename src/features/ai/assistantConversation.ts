import { z } from 'zod'
import { aiMessageSchema, aiSessionSchema } from '../../../supabase/functions/_shared/aiSessions'
import type { AiSuccessResponse } from '../../../supabase/functions/_shared/aiContracts'
import type { SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { AiServiceError } from './aiService'
import type { MessageEvidence } from '../../../supabase/functions/_shared/aiEvidence'

export type ConversationSession = z.infer<typeof aiSessionSchema>
export type ConversationMessage = z.infer<typeof aiMessageSchema> & { evidence?: MessageEvidence }
export type ConversationApi = {
  list: () => Promise<ConversationSession[]>
  create: () => Promise<ConversationSession>
  read: (id: string) => Promise<{ session: ConversationSession; messages: ConversationMessage[] }>
  send: (id: string, prompt: string) => Promise<AiSuccessResponse>
}
export type ConversationState = {
  sessions: ConversationSession[]; session: ConversationSession | null; messages: ConversationMessage[]
  selectedId: string | null; busy: boolean; loading: boolean; error: string | null
  storageError: string | null; draft: string; stopped: boolean
}

export function assistantStarterPrompts(snapshot?: SafetySnapshot) {
  const location = snapshot?.locations[0]
  return [
    'Summarize the high-risk incidents I can access.',
    location ? `What observed risk drivers need review at ${location.name}?` : 'Which authorized sites need priority review?',
    'What overdue corrective actions can you verify from my authorized records?',
    'How has near-miss reporting changed in the comparable periods?',
    'Explain the current risk indicator and any missing evidence.',
  ]
}

// Persist only the selected ID under a tenant/user key, never conversation content or credentials.
export class AssistantConversation {
  private state: ConversationState = {
    sessions: [], session: null, messages: [], selectedId: null, busy: false, loading: false,
    error: null, storageError: null, draft: '', stopped: false,
  }
  private listeners = new Set<() => void>()
  private generation = 0
  private api: ConversationApi
  private storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  private storageKey: string
  private now: () => number
  constructor(api: ConversationApi, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
    storageKey: string, now = () => Date.now()) {
    this.api = api; this.storage = storage; this.storageKey = storageKey; this.now = now
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(next: Partial<ConversationState>) {
    this.state = { ...this.state, ...next }
    this.listeners.forEach((listener) => listener())
  }
  private persist(id: string | null) {
    try {
      if (id) this.storage.setItem(this.storageKey, id)
      else this.storage.removeItem(this.storageKey)
      this.update({ storageError: null })
    } catch {
      this.update({ storageError: 'Browser storage is unavailable. Conversation selection will not survive refresh.' })
    }
  }
  private failure(error: unknown) {
    if (error instanceof AiServiceError) {
      const code = error.response.error.code
      this.update({ stopped: ['session_limit', 'access_denied'].includes(code) })
      return `${error.message} (Request reference: ${error.response.requestId})${
        code === 'session_limit' ? ' Start a new chat.' : code === 'conflict' ? ' Another request is active; wait and retry.' : ''}`
    }
    return error instanceof Error ? error.message : 'Unable to load the conversation. Please retry.'
  }
  setDraft = (draft: string) => this.update({ draft })
  async load() {
    if (this.state.busy || this.state.loading) return
    const generation = ++this.generation
    this.update({ loading: true, error: null, session: null, messages: [], stopped: false })
    try {
      const sessions = await this.api.list()
      if (generation !== this.generation) return
      this.update({ sessions })
      let selected: string | null = null
      try { selected = this.storage.getItem(this.storageKey) } catch {
        this.update({ storageError: 'Browser storage is unavailable. Conversation selection will not survive refresh.' })
      }
      // The recent list is bounded; an older selected chat must be checked through owner-enforced RLS.
      if (selected && z.uuid().safeParse(selected).success) {
        const result = await this.api.read(selected)
        if (generation !== this.generation) return
        this.applySession(result)
      } else if (selected) {
        this.persist(null)
        this.update({ selectedId: null, session: null, messages: [], error: 'The saved conversation has expired or is no longer accessible. Start a new chat.' })
      }
    } catch (error) {
      if (generation === this.generation) {
        this.persist(null)
        this.update({ error: `${this.failure(error)} Use Refresh or start a new chat.`,
          selectedId: null, messages: [], session: null, stopped: true })
      }
    } finally {
      if (generation === this.generation) this.update({ loading: false })
    }
  }
  private applySession(result: { session: ConversationSession; messages: ConversationMessage[] }) {
    const expired = Date.parse(result.session.expires_at) <= this.now()
    // Match the server's two-minute abandoned-turn lock; the server still decides whether recovery is safe.
    const pending = result.messages.some((message) => message.status === 'pending'
      && Date.parse(message.created_at) > this.now() - 120_000)
    const abandoned = result.messages.some((message) => message.status === 'pending') && !pending
    this.update({
      selectedId: result.session.id, session: result.session, messages: result.messages,
      sessions: [result.session, ...this.state.sessions.filter((item) => item.id !== result.session.id)]
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 50),
      stopped: expired || pending || result.messages.length >= 99,
      error: expired ? 'This conversation has expired. Start a new chat.'
        : result.messages.length >= 99 ? 'This conversation reached its message limit. Start a new chat.'
          : pending ? 'A request is pending. Refresh to check completion; do not resend yet.'
            : abandoned ? 'An earlier request is still marked pending. The server can recover abandoned turns on your next question.' : null,
    })
    this.persist(result.session.id)
  }
  async open(id: string) {
    if (this.state.busy || this.state.loading) return
    const generation = ++this.generation
    // Clear previous private history immediately; never show it under a different selection.
    this.update({ loading: true, selectedId: id, messages: [], session: null, error: null, draft: '' })
    try {
      const result = await this.api.read(id)
      if (generation === this.generation) this.applySession(result)
    } catch (error) {
      if (generation === this.generation) this.update({ error: this.failure(error), stopped: true })
    } finally {
      if (generation === this.generation) this.update({ loading: false })
    }
  }
  async newChat() {
    if (this.state.busy || this.state.loading) return
    const generation = ++this.generation
    this.update({ busy: true, error: null })
    try {
      const session = await this.api.create()
      if (generation !== this.generation) return
      this.applySession({ session, messages: [] })
      this.update({ draft: '' })
    } catch (error) {
      if (generation === this.generation) this.update({ error: this.failure(error) })
    } finally {
      if (generation === this.generation) this.update({ busy: false })
    }
  }
  async send() {
    if (this.state.busy || this.state.loading || this.state.stopped) return
    const prompt = this.state.draft.trim()
    if (!prompt || prompt.length > 4_000) {
      this.update({ error: 'Enter a question between 1 and 4,000 characters.' }); return
    }
    if (this.state.session && Date.parse(this.state.session.expires_at) <= this.now()) {
      this.update({ stopped: true, error: 'This conversation has expired. Start a new chat.' }); return
    }
    const generation = ++this.generation
    this.update({ busy: true, error: null })
    let succeeded = false
    try {
      let session = this.state.session
      if (!session) {
        session = await this.api.create()
        if (generation !== this.generation) return
        this.applySession({ session, messages: [] })
      }
      await this.api.send(session.id, prompt)
      if (generation !== this.generation) return
      succeeded = true
      this.update({ draft: '' })
      // Reload persisted messages, not an invented optimistic assistant answer.
      const result = await this.api.read(session.id)
      if (generation === this.generation) this.applySession(result)
    } catch (error) {
      if (generation === this.generation) this.update({
        error: succeeded ? 'Your answer was saved, but conversation refresh failed. Reopen the chat; do not resend the question.'
          : this.failure(error),
        ...(succeeded || (error instanceof AiServiceError && error.response.error.code === 'access_denied')
          ? { messages: [], stopped: true } : {}),
      })
    } finally {
      if (generation === this.generation) this.update({ busy: false })
    }
  }
  dispose() {
    this.generation++
    this.listeners.clear()
    this.state = { ...this.state, loading: false, busy: false }
  }
}
