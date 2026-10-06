import type { SupabaseClient } from '@supabase/supabase-js'

import { createIncidentDraft, getIncidentSummary, submitIncident } from './incidentService'
import type { IncidentDraftInput, IncidentSubmissionInput, IncidentSummary } from './incidentTypes'

const databaseName = 'sentinelqhse-incident-queue'
const databaseVersion = 1
const storeName = 'auto-submit'
// Startup and reconnect events can overlap, so share one in-flight queue sync per browser tab.
let activeSync: Promise<{ submitted: IncidentSummary[]; failed: number }> | null = null

type QueuedIncident = {
  id: string
  input: IncidentSubmissionInput
  createdAt: string
  attemptCount: number
  serverDraftId: string | null
  lastError: string | null
}

function makeQueueId() {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function openQueue(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) return Promise.reject(new Error('Offline incident storage is not supported by this browser.'))
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Unable to open offline incident storage.'))
  })
}

async function readQueuedIncidents(): Promise<QueuedIncident[]> {
  const database = await openQueue()
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    request.onsuccess = () => {
      database.close()
      resolve(request.result as QueuedIncident[])
    }
    request.onerror = () => {
      database.close()
      reject(request.error || new Error('Unable to read queued incidents.'))
    }
  })
}

async function writeQueuedIncident(item: QueuedIncident) {
  const database = await openQueue()
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction(storeName, 'readwrite').objectStore(storeName).put(item)
    request.onsuccess = () => {
      database.close()
      resolve()
    }
    request.onerror = () => {
      database.close()
      reject(request.error || new Error('Unable to store the offline incident.'))
    }
  })
}

async function removeQueuedIncident(id: string) {
  const database = await openQueue()
  return new Promise<void>((resolve, reject) => {
    const request = database.transaction(storeName, 'readwrite').objectStore(storeName).delete(id)
    request.onsuccess = () => {
      database.close()
      resolve()
    }
    request.onerror = () => {
      database.close()
      reject(request.error || new Error('Unable to remove the queued incident.'))
    }
  })
}

// Keep unsent reports in IndexedDB so they survive a page reload; identical form payloads reuse the same queue entry.
export async function enqueueIncidentSubmission(input: IncidentSubmissionInput) {
  const existing = (await readQueuedIncidents()).find((item) => JSON.stringify(item.input) === JSON.stringify(input))
  if (existing) return existing

  const item: QueuedIncident = {
    id: makeQueueId(),
    input,
    createdAt: new Date().toISOString(),
    attemptCount: 0,
    serverDraftId: null,
    lastError: null,
  }
  await writeQueuedIncident(item)
  return item
}

export async function syncQueuedIncidentSubmissions(client: SupabaseClient) {
  if (activeSync) return activeSync
  activeSync = syncQueuedIncidentSubmissionsInternal(client)
  try {
    return await activeSync
  } finally {
    activeSync = null
  }
}

async function syncQueuedIncidentSubmissionsInternal(client: SupabaseClient) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { submitted: [] as IncidentSummary[], failed: 0 }

  const queued = (await readQueuedIncidents()).sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  const submitted: IncidentSummary[] = []
  let failed = 0

  // Process oldest entries first. The stable queue ID is also sent to the server when creating a draft,
  // allowing the database to find that same draft if the client has to retry creation.
  for (const item of queued) {
    try {
      let draftId = item.serverDraftId
      let draft: IncidentSummary | null = null
      if (!draftId) {
        draft = await createIncidentDraft(client, item.input as IncidentDraftInput, { clientSubmissionId: item.id })
        draftId = draft.id
        await writeQueuedIncident({ ...item, serverDraftId: draftId, lastError: null })
      }

      // A previous sync may have submitted this saved draft before it failed to remove the local queue entry.
      if (item.serverDraftId) {
        const existingDraft = await getIncidentSummary(client, item.serverDraftId)
        if (existingDraft.status !== 'draft') {
          submitted.push(existingDraft)
          await removeQueuedIncident(item.id)
          continue
        }
      }

      if (draft && draft.status !== 'draft') {
        submitted.push(draft)
        await removeQueuedIncident(item.id)
        continue
      }

      const result = await submitIncident(client, draftId, item.input)
      if (result.status !== 'submitted') throw new Error('The server did not confirm the incident submission.')
      submitted.push(result)
      await removeQueuedIncident(item.id)
    } catch (error) {
      // Keep failed work for a later sync; saved server drafts are checked for completion before another submit.
      failed += 1
      await writeQueuedIncident({
        ...item,
        attemptCount: item.attemptCount + 1,
        lastError: error instanceof Error ? error.message : 'Unable to synchronize the queued incident.',
      })
    }
  }

  return { submitted, failed }
}
