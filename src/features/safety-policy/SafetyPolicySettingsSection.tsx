import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { Alert, Button, Card, Spinner } from '../../components/ui'
import {
  createSafetyPolicyStarterDraft,
  deleteSafetyPolicy,
  getSafetyPolicySettings,
  saveSafetyPolicyDraft,
  setSafetyPolicyActive,
  type SafetyPolicyDraft,
  type SafetyPolicyFrequency,
  type SafetyPolicySettings,
} from './safetyPolicyService'

const EMPTY_SETTINGS: SafetyPolicySettings = {
  configured: false,
  active: false,
  deleted: false,
  hasDraft: false,
  isStarterDraft: false,
  policyId: null,
  versionId: null,
  versionNumber: null,
  publishedVersionNumber: null,
  title: '',
  text: '',
  frequency: 'every_login',
  intervalDays: null,
  timezone: 'UTC',
  updatedAt: null,
}

function draftFromSettings(settings: SafetyPolicySettings): SafetyPolicyDraft {
  return {
    title: settings.title,
    text: settings.text,
    frequency: settings.frequency,
    intervalDays: settings.intervalDays ?? 7,
    timezone: settings.timezone || 'UTC',
  }
}

function draftsMatch(left: SafetyPolicyDraft, right: SafetyPolicyDraft): boolean {
  return left.title === right.title
    && left.text === right.text
    && left.frequency === right.frequency
    && (left.frequency !== 'interval_days' || left.intervalDays === right.intervalDays)
    && (left.frequency !== 'weekly' || left.timezone === right.timezone)
}

export function SafetyPolicySettingsSection({ client }: { client: SupabaseClient }) {
  const [settings, setSettings] = useState<SafetyPolicySettings>(EMPTY_SETTINGS)
  const [draft, setDraft] = useState<SafetyPolicyDraft>(draftFromSettings(EMPTY_SETTINGS))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const lastHash = useRef(window.location.hash)
  const dirty = !draftsMatch(draft, draftFromSettings(settings))

  const loadSettings = useCallback(() => getSafetyPolicySettings(client), [client])
  const applySettings = useCallback((current: SafetyPolicySettings) => {
    setSettings(current)
    setDraft(draftFromSettings(current))
  }, [])

  const load = useCallback(async () => {
    try {
      applySettings(await loadSettings())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Safety Policy settings.')
    } finally {
      setLoading(false)
    }
  }, [applySettings, loadSettings])

  useEffect(() => {
    let active = true
    void loadSettings()
      .then((current) => {
        if (active) applySettings(current)
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load Safety Policy settings.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [applySettings, loadSettings])

  const retryLoad = () => {
    setLoading(true)
    setError('')
    void load()
  }

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!dirty) return
      event.preventDefault()
      event.returnValue = ''
    }
    const warnBeforeHashNavigation = () => {
      const nextHash = window.location.hash
      if (nextHash === lastHash.current) return
      if (dirty && !window.confirm('You have unsaved Safety Policy changes. Leave without saving?')) {
        const currentUrl = `${window.location.pathname}${window.location.search}${lastHash.current}`
        window.history.replaceState(null, '', currentUrl)
        window.dispatchEvent(new HashChangeEvent('hashchange'))
        return
      }
      lastHash.current = nextHash
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    window.addEventListener('hashchange', warnBeforeHashNavigation)
    return () => {
      window.removeEventListener('beforeunload', warnBeforeLeaving)
      window.removeEventListener('hashchange', warnBeforeHashNavigation)
    }
  }, [dirty])

  const updateDraft = <K extends keyof SafetyPolicyDraft>(key: K, value: SafetyPolicyDraft[K]) => {
    setMessage('')
    setDraft((current) => ({ ...current, [key]: value }))
  }

  const save = async () => {
    if (!draft.title.trim() || !draft.text.trim()) {
      setError('Enter both a policy title and the complete policy text.')
      return
    }
    if (draft.frequency === 'interval_days' && (!draft.intervalDays || draft.intervalDays < 1 || draft.intervalDays > 365)) {
      setError('Choose an acknowledgement interval from 1 to 365 days.')
      return
    }
    if (draft.frequency === 'weekly') {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: draft.timezone }).format()
      } catch {
        setError('Enter a valid IANA timezone, such as Europe/London.')
        return
      }
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const updated = await saveSafetyPolicyDraft(client, draft)
      setSettings(updated)
      setDraft(draftFromSettings(updated))
      setMessage(updated.versionNumber ? `Draft saved as version ${updated.versionNumber}. Publish it when it is ready to take effect.` : 'Policy draft saved.')
      window.dispatchEvent(new Event('safety-policy-updated'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the safety policy.')
    } finally {
      setSaving(false)
    }
  }

  const loadStarterTemplate = async () => {
    setLoadingTemplate(true)
    setError('')
    setMessage('')
    try {
      const updated = await createSafetyPolicyStarterDraft(client)
      setSettings(updated)
      setDraft(draftFromSettings(updated))
      setMessage('Starter template loaded as an unpublished draft. Review and edit it before publishing.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load the safety policy starter template.')
    } finally {
      setLoadingTemplate(false)
    }
  }

  const toggleActive = async (active: boolean) => {
    setUpdating(true)
    setError('')
    setMessage('')
    try {
      await setSafetyPolicyActive(client, active)
      const updated = await getSafetyPolicySettings(client)
      setSettings(updated)
      setDraft(draftFromSettings(updated))
      setMessage(active ? 'Safety Policy published.' : 'Safety Policy unpublished. Users can continue without acknowledging it.')
      window.dispatchEvent(new Event('safety-policy-updated'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update policy activation.')
    } finally {
      setUpdating(false)
    }
  }

  const removePolicy = async () => {
    if (!window.confirm('Deactivate and delete this policy configuration? Policy versions and acknowledgement history will be retained for audit.')) return
    setUpdating(true)
    setError('')
    setMessage('')
    try {
      await deleteSafetyPolicy(client)
      const updated = await getSafetyPolicySettings(client)
      setSettings(updated)
      setDraft(draftFromSettings(updated))
      setMessage('Policy deleted. Historical versions and acknowledgements have been retained.')
      window.dispatchEvent(new Event('safety-policy-updated'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete the safety policy.')
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <Card className="flex items-center gap-3 p-6" role="status">
        <Spinner size={18} fill="currentColor" className="text-brand" label="Loading Safety Policy settings" />
        <span className="text-sm text-muted">Loading Safety Policy settings…</span>
      </Card>
    )
  }

  return (
    <div className="grid gap-5">
      <Card className="grid gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">Safety Policy</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
              Save policy changes as drafts. Published versions remain in force until an authorized administrator explicitly publishes the reviewed draft.
            </p>
          </div>
          {settings.configured && (
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${settings.active ? 'bg-success/10 text-success' : 'bg-surface-soft text-muted'}`}>
              {settings.deleted
                ? 'Deleted'
                : settings.active && settings.hasDraft
                  ? 'Published · draft pending'
                  : settings.active
                    ? 'Published'
                    : settings.hasDraft
                      ? 'Draft · not published'
                      : 'Unpublished'}
            </span>
          )}
          </div>

          {!settings.active && (
            <Alert tone="warning">
              {settings.configured
                ? 'No safety policy is currently published. Users can continue to the workspace without one.'
                : 'No safety policy is set up. Users can continue to the workspace without one.'}{' '}
              Create an organization-specific policy or load the starter template below; drafts are not enforced until published.
            </Alert>
          )}
          {settings.isStarterDraft && (
            <Alert tone="warning">
              This is a generic starter template. Review and customize it for your organization before publishing; it is not legal or regulatory advice.
            </Alert>
          )}
          {settings.hasDraft && settings.active && settings.publishedVersionNumber && (
            <Alert tone="info">
              Version {settings.publishedVersionNumber} remains published while these draft changes are reviewed. Publishing the draft will make its version effective and require acknowledgement under the selected schedule.
            </Alert>
          )}

        {error && (
          <div className="grid gap-2">
            <Alert tone="danger">{error}</Alert>
            <Button variant="outline" className="w-fit" onClick={retryLoad}>Retry loading settings</Button>
          </div>
        )}
        {message && <Alert tone="success">{message}</Alert>}

        {!settings.hasDraft && (
          <Button
            variant="outline"
            className="w-fit"
            loading={loadingTemplate}
            disabled={saving || updating}
            onClick={() => void loadStarterTemplate()}
          >
            Use starter template
          </Button>
        )}

        <div className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Policy title
            <input
              value={draft.title}
              maxLength={200}
              onChange={(event) => updateDraft('title', event.target.value)}
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              placeholder="Company safety policy"
            />
          </label>

          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Complete policy text
            <textarea
              value={draft.text}
              onChange={(event) => updateDraft('text', event.target.value)}
              rows={12}
              maxLength={50000}
              className="min-h-64 resize-y rounded-xl border border-line bg-surface px-3 py-2.5 text-sm leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              placeholder="Write or paste the complete policy…"
            />
            <span className="text-xs font-normal text-muted">{draft.text.length.toLocaleString()} / 50,000 characters</span>
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Acknowledgement frequency
            <select
              value={draft.frequency}
              onChange={(event) => updateDraft('frequency', event.target.value as SafetyPolicyFrequency)}
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <option value="every_login">Every login</option>
              <option value="first_login">First acknowledgement of each version</option>
              <option value="interval_days">Every N days from last acknowledgement</option>
              <option value="weekly">Every Monday</option>
            </select>
          </label>

          {draft.frequency === 'interval_days' && (
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Interval (days)
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                value={draft.intervalDays ?? 7}
                onChange={(event) => updateDraft('intervalDays', Number(event.target.value))}
                className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              />
            </label>
          )}

          {draft.frequency === 'weekly' && (
            <label className="grid gap-1.5 text-sm font-medium text-foreground">
              Organization timezone (IANA)
              <input
                value={draft.timezone}
                onChange={(event) => updateDraft('timezone', event.target.value)}
                className="h-10 rounded-xl border border-line bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                placeholder="Europe/London"
                autoComplete="off"
              />
              <span className="text-xs font-normal text-muted">The weekly acknowledgement window resets Monday at 00:00 in this timezone.</span>
            </label>
          )}
        </div>

        {settings.versionNumber && (
          <p className="text-xs text-muted">
            {settings.hasDraft ? 'Draft version' : 'Policy version'} {settings.versionNumber}
            {settings.publishedVersionNumber && settings.hasDraft ? ` · Published version ${settings.publishedVersionNumber}` : ''}
            {settings.updatedAt ? ` · Updated ${new Date(settings.updatedAt).toLocaleString()}` : ''}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button loading={saving} disabled={!dirty || loadingTemplate} onClick={() => void save()}>
            Save draft
          </Button>
          {(settings.hasDraft || (settings.configured && settings.versionId && !settings.active)) && (
            <Button loading={updating} disabled={dirty || saving || loadingTemplate} onClick={() => void toggleActive(true)}>
              Publish policy
            </Button>
          )}
          {settings.configured && settings.active && (
            <Button variant="outline" loading={updating} disabled={dirty || saving || loadingTemplate} onClick={() => void toggleActive(false)}>
              Unpublish policy
            </Button>
          )}
          {settings.configured && !settings.deleted && (
            <Button variant="danger" loading={updating} disabled={dirty || saving || loadingTemplate} onClick={() => void removePolicy()}>
              Delete policy
            </Button>
          )}
          {dirty && <span className="text-xs text-caution">Unsaved changes</span>}
        </div>
      </Card>
    </div>
  )
}
