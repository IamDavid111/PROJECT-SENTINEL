import { hasAiPermission, parseAiPrompt, resolveAiAccessContext } from './access.ts'
import { BUILT_IN_BACKEND_ROLES, hasPermission } from '../../../src/data/userManagementConfig.ts'

// Unit checks of trusted-context validation; these do not replace database RLS or endpoint tests.
function assertEquals<T>(actual: T, expected: T) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`)
  }
}

Deno.test('AI context requires an active matching profile and membership', () => {
  const userId = 'user-1'
  const organizationId = 'org-1'
  const profile = { id: userId, organization_id: organizationId, account_status: 'active' }
  const membership = { user_id: userId, organization_id: organizationId, role: 'Field Worker' }

  assertEquals(resolveAiAccessContext(userId, profile, membership)?.organizationId, organizationId)
  assertEquals(resolveAiAccessContext(userId, { ...profile, account_status: 'suspended' }, membership), null)
  assertEquals(resolveAiAccessContext(userId, profile, { ...membership, organization_id: 'org-2' }), null)
  assertEquals(resolveAiAccessContext(userId, profile, { ...membership, user_id: 'user-2' }), null)
  assertEquals(resolveAiAccessContext(userId, { ...profile, id: 'user-2' }, membership), null)
  assertEquals(resolveAiAccessContext(userId, profile, null), null)
})

// Catch permission drift without trusting browser-supplied permissions at runtime.
Deno.test('server AI grants stay aligned with the existing application permission map', () => {
  for (const role of [...BUILT_IN_BACKEND_ROLES, 'Custom Safety Role']) {
    for (const permissions of [[], ['use_ai_assistant'], ['view_dashboard']]) {
      assertEquals(hasAiPermission(role, permissions), hasPermission(role, 'use_ai_assistant', permissions))
    }
  }
})

Deno.test('AI permission follows built-in and custom role grants', () => {
  assertEquals(hasAiPermission('Field Worker'), true)
  assertEquals(hasAiPermission('Custom Safety Role', ['use_ai_assistant']), true)
  assertEquals(hasAiPermission('Custom Safety Role', ['view_dashboard']), false)
  assertEquals(hasAiPermission('Unknown Role'), false)
})

Deno.test('AI prompt body rejects client-supplied identity and organization context', () => {
  assertEquals(parseAiPrompt({ prompt: '  Explain the safety term  ' }), 'Explain the safety term')
  assertEquals(parseAiPrompt({ prompt: 'Question', organization_id: 'org-2' }), null)
  assertEquals(parseAiPrompt({ prompt: 'Question', user_id: 'user-2' }), null)
  assertEquals(parseAiPrompt({ prompt: 'Question', permissions: ['use_ai_assistant'] }), null)
  assertEquals(parseAiPrompt({ prompt: '   ' }), null)
})
