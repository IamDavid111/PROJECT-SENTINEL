import { useCallback, useEffect, useRef, useState } from 'react'

import { Button, Field, Input } from '../../components/ui'
import { supabase } from '../../lib/supabase'

export interface SiteCodeFieldProps {
  organizationId: string
  value: string
  onChange: (code: string) => void
  disabled?: boolean
}

/** Read-only, server-generated site code with an explicit regenerate action. */
export function SiteCodeField({ organizationId, value, onChange, disabled = false }: SiteCodeFieldProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requested = useRef(false)

  const generate = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('generate_site_code', { p_organization_id: organizationId })
    setLoading(false)
    if (rpcError || !data) {
      setError('Could not generate a site code. Try again.')
      return
    }
    onChange(String(data))
  }, [onChange, organizationId])

  useEffect(() => {
    if (value || requested.current || !organizationId) return
    requested.current = true
    void generate()
  }, [generate, organizationId, value])

  return (
    <Field
      label="Site code"
      htmlFor="siteCode"
      hint="Generated for this organization. Regenerate if you need a different one."
      error={error}
    >
      <div className="flex gap-2">
        <Input
          id="siteCode"
          value={value}
          disabled
          placeholder={loading ? 'Generating…' : 'SIT-XXXXXXXXXX'}
          className="font-mono uppercase tracking-[0.08em] disabled:opacity-100"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void generate()}
          loading={loading}
          disabled={disabled}
          className="shrink-0"
        >
          Regenerate code
        </Button>
      </div>
    </Field>
  )
}
