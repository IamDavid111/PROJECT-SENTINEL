import { z } from 'zod'
import { safetySnapshotSchema } from './safetyIntelligenceContracts.ts'

export const operationalSourceKeySchema = z.string().regex(
  /^(incidents|actions|investigations|causes|findings|closures):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
).refine((key) => z.uuid().safeParse(key.split(':')[1]).success)

export const answerPresentationSchema = z.object({
  observations: z.array(z.object({ key: z.enum(['risk', 'highRisk', 'nearMiss', 'category', 'resolution']), value: z.string().max(8_000) })
    .refine((item) => {
      try { return safetySnapshotSchema.shape.metrics.shape[item.key].safeParse(JSON.parse(item.value)).success }
      catch { return false }
    }, 'Invalid canonical observation')).max(5),
  interpretation: z.string().max(6_000), advice: z.string().max(4_000),
  limitations: z.string().max(3_000), serverLimitations: z.array(z.string().max(2_000)).max(40),
}).strict()

// No historical labels/excerpts are returned by the provenance RPC; source details require fresh RLS reads.
export const messageEvidenceSchema = z.object({
  request_id: z.uuid(), sourceIds: z.array(operationalSourceKeySchema).max(12),
  asOf: z.iso.datetime().nullable(), methodology: z.string().max(100).nullable(),
  visibility: z.enum(['personal', 'organization']).nullable(),
  presentation: answerPresentationSchema.nullable(),
}).strict()
export type MessageEvidence = z.infer<typeof messageEvidenceSchema>
