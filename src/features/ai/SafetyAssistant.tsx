import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { Bot, Sparkles, Send, Plus, History, ShieldCheck, MessageSquare } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SafetyScope, SafetySnapshot } from '../../../supabase/functions/_shared/safetyIntelligenceContracts'
import { createAiSession, getAiSession, listAiSessions, sendSafetyCopilotMessage } from './aiService'
import { AssistantConversation, assistantStarterPrompts } from './assistantConversation'
import { AnswerEvidence, AnswerSections } from './AnswerEvidence'

export function SafetyAssistant({ client, scope, snapshot }: {
  client: SupabaseClient; scope: SafetyScope; snapshot?: SafetySnapshot
}) {
  const queryClient = useQueryClient()
  const conversation = useMemo(() => {
    const prefix = ['ai-conversations', scope.userId, scope.organizationId]
    const storage = {
      getItem: (key: string) => window.localStorage.getItem(key),
      setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
      removeItem: (key: string) => window.localStorage.removeItem(key),
    }
    return new AssistantConversation({
      list: () => queryClient.fetchQuery({ queryKey: [...prefix, 'list'], queryFn: () => listAiSessions(client), staleTime: 0, retry: false }),
      create: () => createAiSession(client),
      read: (id) => queryClient.fetchQuery({ queryKey: [...prefix, id], queryFn: () => getAiSession(client, id), staleTime: 0, retry: false }),
      send: (id, prompt) => sendSafetyCopilotMessage(client, id, prompt),
    }, storage, `sentinel-ai-session:${scope.organizationId}:${scope.userId}`)
  }, [client, queryClient, scope.userId, scope.organizationId])
  const state = useSyncExternalStore(conversation.subscribe, conversation.getSnapshot, conversation.getSnapshot)
  const messageList = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const list = messageList.current
    list?.scrollTo({ top: list.scrollHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }, [state.messages.length, state.busy])
  useEffect(() => {
    void conversation.load()
    const refresh = () => { void conversation.load() }
    window.addEventListener('focus', refresh)
    window.addEventListener('incident-records-updated', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('incident-records-updated', refresh)
      conversation.dispose()
      queryClient.removeQueries({ queryKey: ['ai-conversations', scope.userId, scope.organizationId] })
      queryClient.removeQueries({ queryKey: ['ai-evidence', scope.userId, scope.organizationId] })
    }
  }, [conversation, queryClient, scope.userId, scope.organizationId])
  const disabled = state.busy || state.loading
  return <section className="safety-intelligence-section assistant-section" id="safety-intelligence-assistant" aria-labelledby="safety-assistant-title">
    <div className="safety-section-heading">
      <div><div className="eyebrow">SAFETY COPILOT</div><h2 id="safety-assistant-title">AI Safety Assistant</h2>
        <p>Explore the operational records you are authorized to access. Advice is not an official safety decision.</p>
        <details className="assistant-knowledge-notice"><summary><ShieldCheck size={14} aria-hidden="true" />What this assistant can access</summary>
          <p>No procedure, regulatory, inspection or audit knowledge library is connected.</p>
          <p>Private, bounded conversation history. Read-only operational evidence; human review required.</p>
        </details></div>
      <button type="button" className="button button-outline button-small" disabled={disabled} onClick={() => void conversation.newChat()}><Plus size={16} aria-hidden="true" />New Chat</button>
    </div>
    <div className="assistant-conversation-layout">
      <div className="assistant-chat">
        <div className="assistant-chat-heading"><h3><Bot size={18} aria-hidden="true" />Conversation</h3>
          <span className="safety-label"><ShieldCheck size={13} aria-hidden="true" />Private · Advisory</span></div>
        <div className="assistant-chat-alerts">
        {state.storageError && <p role="alert" className="auth-message error">{state.storageError}</p>}
        {state.error && <div role="alert" className="auth-message error"><p>{state.error}</p></div>}
        </div>
        <div ref={messageList} className="assistant-messages" aria-label="Conversation messages" aria-live="polite" aria-busy={disabled}>
          {state.loading ? <p role="status">Loading your private conversation...</p>
            : !state.messages.length && <div className="assistant-welcome">
              <span className="assistant-avatar"><Bot size={20} aria-hidden="true" /></span>
              <div className="assistant-welcome-bubble"><h4>How can I help you review safety today?</h4>
                <p>Ask about reported patterns, incidents or corrective actions you can access. Missing evidence will be acknowledged.</p>
                <small>Choose a suggested prompt or ask your own question.</small></div>
            </div>}
          {state.messages.map((message) => <article key={message.id} className={`assistant-message assistant-message-${message.role}`}>
            <div className="assistant-message-heading"><strong>{message.role === 'user' ? 'You' : <><Bot size={14} aria-hidden="true" />Safety Copilot · Advisory</>}</strong></div>
            {message.role === 'assistant' && message.evidence?.presentation
              ? <AnswerSections evidence={message.evidence} /> : <p>{message.content}</p>}
            {message.role === 'assistant' && message.evidence && !message.evidence.presentation
              && <small>Older answer: original text retained. Structured sections were not saved; citations below come only from validated server metadata.</small>}
            {message.role === 'assistant' && (message.evidence
              ? <AnswerEvidence client={client} scope={scope} evidence={message.evidence} />
              : <p>Validated evidence metadata is unavailable for this answer. No source links are inferred from its text.</p>)}
            {message.status === 'failed' && <small>Request failed. No assistant answer was saved for this turn.</small>}
            {message.status === 'pending' && <small>Completion not yet recorded. Refresh conversations to check the request status.</small>}
          </article>)}
          {state.busy && <p role="status" className="assistant-processing"><span aria-hidden="true" className="assistant-processing-dot" />Processing your request...</p>}
        </div>
        <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); void conversation.send() }}>
          <label htmlFor="safety-assistant-question">Your question</label>
          <div className="assistant-composer-input"><textarea ref={composer} id="safety-assistant-question" rows={2} maxLength={4_000} value={state.draft}
            disabled={disabled || state.stopped} onChange={(event) => conversation.setDraft(event.target.value)}
            placeholder="Ask about your authorized operational data..." />
            <button type="submit" aria-label="Send question" title="Send question" className="button button-primary assistant-send" disabled={disabled || state.stopped || !state.draft.trim()}><Send size={18} aria-hidden="true" /><span className="sr-only">Send</span></button></div>
          <small>{state.draft.length}/4,000 · Human review required</small>
        </form>
      </div>
      <aside className="assistant-sidebar" aria-label="Conversation tools">
        <section className="assistant-suggestions" aria-labelledby="assistant-suggestions-title">
          <h3 id="assistant-suggestions-title"><Sparkles size={18} aria-hidden="true" />Suggested prompts</h3>
          <p>A starting point for your safety review</p>
          <div className="assistant-starters">{assistantStarterPrompts(snapshot).map((prompt) =>
            <button type="button" key={prompt} disabled={disabled || state.stopped} onClick={() => {
              conversation.setDraft(prompt)
              composer.current?.focus()
            }}><MessageSquare size={15} aria-hidden="true" /><span>{prompt}</span></button>)}</div>
          <small>Suggestions start a question—not a canned answer. Nothing is sent until you choose Send.</small>
        </section>
        <details className="assistant-history">
          <summary><History size={18} aria-hidden="true" />Your conversations <span>{state.sessions.length}</span></summary>
          <div className="assistant-session-list" aria-label="Your private conversations">
            <button type="button" className="button button-outline button-small" disabled={disabled} onClick={() => void conversation.load()}>Refresh conversations</button>
            {!state.sessions.length && !state.loading && <p>No conversations available.</p>}
            {state.sessions.map((session) => <button type="button" key={session.id} disabled={disabled}
              aria-pressed={state.selectedId === session.id} onClick={() => void conversation.open(session.id)}>
              <strong>{session.title}</strong><small>{new Date(session.updated_at).toLocaleString()}</small>
            </button>)}
            <small>Showing up to 50 recent conversations. Private chats expire 30 days after creation. Context is bounded; this is not permanent memory.</small>
          </div>
        </details>
      </aside>
    </div>
  </section>
}
