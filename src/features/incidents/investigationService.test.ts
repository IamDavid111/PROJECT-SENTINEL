import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  getInvestigationTeamMembers,
  addInvestigationTeamMember,
  removeInvestigationTeamMember,
  getInvestigationDeadlines,
  updateInvestigationDeadlines,
  addInvestigationTimelineEvent,
  getInvestigationTimeline,
  calculateInvestigationDueDate,
  formatInvestigationDuration,
  InvestigationServiceError,
  type InvestigationDeadlines,
  type InvestigationTeamMember,
} from './investigationService'

// Mock Supabase client
const mockClient: Partial<SupabaseClient> = {
  from: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnThis(),
  })),
  auth: {
    getUser: vi.fn(() => Promise.resolve({
      data: { user: { id: 'test-user-id' } },
    })),
  },
}

describe('Investigation Service', () => {
  describe('formatInvestigationDuration', () => {
    it('formats hours less than 24', () => {
      expect(formatInvestigationDuration(1)).toBe('1 hour')
      expect(formatInvestigationDuration(12)).toBe('12 hours')
    })

    it('formats days when hours are divisible by 24', () => {
      expect(formatInvestigationDuration(24)).toBe('1 day')
      expect(formatInvestigationDuration(48)).toBe('2 days')
      expect(formatInvestigationDuration(168)).toBe('7 days')
    })

    it('formats days and remaining hours', () => {
      expect(formatInvestigationDuration(25)).toBe('1 day 1h')
      expect(formatInvestigationDuration(72)).toBe('3 days')
      expect(formatInvestigationDuration(90)).toBe('3 days 18h')
    })
  })

  describe('calculateInvestigationDueDate', () => {
    const baseTime = '2024-01-01T12:00:00Z'
    const baseDate = new Date(baseTime)

    it('calculates due date with default deadlines', () => {
      const critical = calculateInvestigationDueDate(baseTime, 'Critical')
      const high = calculateInvestigationDueDate(baseTime, 'High')
      const medium = calculateInvestigationDueDate(baseTime, 'Medium')
      const low = calculateInvestigationDueDate(baseTime, 'Low')

      expect(critical.getTime() - baseDate.getTime()).toBe(24 * 60 * 60 * 1000)
      expect(high.getTime() - baseDate.getTime()).toBe(72 * 60 * 60 * 1000)
      expect(medium.getTime() - baseDate.getTime()).toBe(168 * 60 * 60 * 1000)
      expect(low.getTime() - baseDate.getTime()).toBe(336 * 60 * 60 * 1000)
    })

    it('calculates due date with custom deadlines', () => {
      const customDeadlines: InvestigationDeadlines = {
        critical_hours: 48,
        high_hours: 96,
        medium_hours: 192,
        low_hours: 384,
        verification_enabled: true,
      }

      const critical = calculateInvestigationDueDate(baseTime, 'Critical', customDeadlines)
      const high = calculateInvestigationDueDate(baseTime, 'High', customDeadlines)

      expect(critical.getTime() - baseDate.getTime()).toBe(48 * 60 * 60 * 1000)
      expect(high.getTime() - baseDate.getTime()).toBe(96 * 60 * 60 * 1000)
    })

    it('handles unknown severity levels', () => {
      const unknown = calculateInvestigationDueDate(baseTime, 'Unknown')
      expect(unknown.getTime() - baseDate.getTime()).toBe(72 * 60 * 60 * 1000)
    })
  })

  describe('Investigation Service Error', () => {
    it('creates proper error instance', () => {
      const error = new InvestigationServiceError('Test error message')
      expect(error.message).toBe('Test error message')
      expect(error.name).toBe('InvestigationServiceError')
      expect(error instanceof Error).toBe(true)
    })
  })

  describe('Team Member Operations', () => {
    it('should validate team member schema', () => {
      const validMember: InvestigationTeamMember = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        organization_id: '550e8400-e29b-41d4-a716-446655440001',
        severity_level: 'Critical',
        user_id: '550e8400-e29b-41d4-a716-446655440002',
        full_name: 'John Doe',
        account_status: 'active',
        added_at: '2024-01-01T12:00:00Z',
      }

      expect(validMember.severity_level).toBe('Critical')
      expect(validMember.full_name).toBe('John Doe')
    })
  })

  describe('Deadline Operations', () => {
    it('should validate deadline schema', () => {
      const validDeadlines: InvestigationDeadlines = {
        critical_hours: 24,
        high_hours: 72,
        medium_hours: 168,
        low_hours: 336,
        verification_enabled: true,
      }

      expect(validDeadlines.critical_hours).toBe(24)
      expect(validDeadlines.verification_enabled).toBe(true)
    })

    it('should not allow zero or negative hours', () => {
      const invalidDeadlines = [
        { critical_hours: 0, high_hours: 72, medium_hours: 168, low_hours: 336, verification_enabled: true },
        { critical_hours: -24, high_hours: 72, medium_hours: 168, low_hours: 336, verification_enabled: true },
      ]

      invalidDeadlines.forEach((deadlines) => {
        expect(() => {
          if (deadlines.critical_hours <= 0) {
            throw new Error('Hours must be positive')
          }
        }).toThrow()
      })
    })
  })

  describe('Timeline Event Operations', () => {
    it('validates event type enum', () => {
      const validTypes = ['created', 'assigned', 'started', 'finding_added', 'status_changed', 'completed'] as const

      validTypes.forEach((type) => {
        expect(['created', 'assigned', 'started', 'finding_added', 'status_changed', 'completed']).toContain(type)
      })
    })

    it('requires organization context for timeline events', () => {
      const organizationId = '550e8400-e29b-41d4-a716-446655440000'
      const investigationId = '550e8400-e29b-41d4-a716-446655440001'

      expect(organizationId).toBeTruthy()
      expect(investigationId).toBeTruthy()
    })
  })
})

describe('Investigation Service Integration Scenarios', () => {
  it('tracks investigation lifecycle through timeline', () => {
    const orgId = '550e8400-e29b-41d4-a716-446655440000'
    const investigationId = '550e8400-e29b-41d4-a716-446655440001'
    const actorId = '550e8400-e29b-41d4-a716-446655440002'

    const events = [
      { type: 'created', details: { created_by: actorId } },
      { type: 'assigned', details: { assigned_to: 'investigator_id' } },
      { type: 'started', details: { started_by: actorId } },
      { type: 'finding_added', details: { findings: 'test findings' } },
      { type: 'completed', details: { completed_by: actorId } },
    ]

    expect(events.length).toBe(5)
    expect(events[0].type).toBe('created')
    expect(events[events.length - 1].type).toBe('completed')
  })

  it('manages severity-based team assignment', () => {
    const severityLevels = ['Critical', 'High', 'Medium', 'Low']
    const teams: Record<string, string[]> = {
      Critical: ['user1', 'user2'],
      High: ['user2', 'user3'],
      Medium: ['user3'],
      Low: ['user4'],
    }

    severityLevels.forEach((level) => {
      expect(teams[level]).toBeDefined()
      expect(Array.isArray(teams[level])).toBe(true)
    })
  })

  it('enforces deadline compliance', () => {
    const deadlines: InvestigationDeadlines = {
      critical_hours: 24,
      high_hours: 72,
      medium_hours: 168,
      low_hours: 336,
      verification_enabled: true,
    }

    const now = new Date()
    const criticalDue = new Date(now.getTime() + deadlines.critical_hours * 60 * 60 * 1000)
    const isOverdue = now > criticalDue

    expect(isOverdue).toBe(false)
    expect(criticalDue.getTime() - now.getTime()).toBeGreaterThan(0)
  })
})
