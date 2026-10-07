import { z } from 'zod'

export const aiSessionSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(120),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  expires_at: z.iso.datetime({ offset: true }),
})
export const aiMessageSchema = z.object({
  id: z.number().int().positive(),
  request_id: z.uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(32_000),
  status: z.enum(['pending', 'succeeded', 'failed']),
  created_at: z.iso.datetime({ offset: true }),
})
export const aiTurnRequestSchema = z.object({
  prompt: z.string().trim().min(1).max(4_000),
  sessionId: z.uuid().optional(),
  // Only the registered feature may opt into grounding; identities/instructions remain forbidden.
  feature: z.enum(['safety_copilot', 'qhse_knowledge']).optional(),
  days: z.union([z.literal(30), z.literal(90)]).optional(),
  siteId: z.uuid().optional(),
  department: z.string().trim().min(1).max(120).optional(),
  documentIds: z.array(z.uuid()).min(1).max(50).optional(),
}).strict().superRefine((value, context) => {
  if (value.feature === 'safety_copilot' && !value.sessionId) {
    context.addIssue({ code: 'custom', message: 'Safety Copilot requires a conversation session.', path: ['sessionId'] })
  }
  // Knowledge answers are stateless: saved history could otherwise replay excerpts after access is revoked.
  if (value.feature === 'qhse_knowledge' && (value.sessionId || value.days !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Knowledge questions do not use sessions or day windows.', path: ['feature'] })
  }
  if (value.feature !== 'qhse_knowledge' && (value.department !== undefined || value.documentIds !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Knowledge filters require QHSE knowledge.', path: ['feature'] })
  }
  if (!value.feature && (value.days !== undefined || value.siteId !== undefined)) {
    context.addIssue({ code: 'custom', message: 'Operational filters require Safety Copilot.', path: ['feature'] })
  }
})

const historySchema = z.array(aiMessageSchema.pick({
  role: true, content: true, request_id: true,
})).max(20)

// Keep complete exchanges, not orphan assistant answers. Character limits conservatively bound
// context without claiming a precise token count, which varies by model and language.
export function assembleSessionContext(history: unknown, prompt: string, maxCharacters = 24_000) {
  if (!Number.isInteger(maxCharacters) || maxCharacters < prompt.length || maxCharacters > 24_000) {
    throw new Error('Invalid conversation context budget')
  }
  const messages = historySchema.parse(history)
  const turns: Array<Array<{ role: 'user' | 'assistant'; content: string }>> = []
  for (let i = 0; i < messages.length - 1; i += 2) {
    const user = messages[i]
    const assistant = messages[i + 1]
    if (user.role !== 'user' || assistant.role !== 'assistant' || user.request_id !== assistant.request_id) {
      throw new Error('Invalid conversation history')
    }
    turns.push([{ role: user.role, content: user.content }, { role: assistant.role, content: assistant.content }])
  }
  if (messages.length % 2) throw new Error('Incomplete conversation history')
  let remaining = maxCharacters - prompt.length
  const selected: typeof turns = []
  for (const turn of turns.reverse()) {
    const size = turn.reduce((sum, item) => sum + item.content.length, 0)
    if (size > remaining) break
    selected.unshift(turn)
    remaining -= size
  }
  return [...selected.flat(), { role: 'user' as const, content: prompt }]
}
