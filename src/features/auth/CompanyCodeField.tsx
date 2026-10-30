import { useCallback, useEffect, useRef, useState } from 'react'

import { Button, Field, Input } from '../../components/ui'
import { supabase } from '../../lib/supabase'

export interface CompanyCodeFieldProps {
  value: string
  onChange: (code: string) => void
  disabled?: boolean
}

/** Read-only, server-generated company code with an explicit regenerate action. */
export function CompanyCodeField({ value, onChange, disabled = false }: CompanyCodeFieldProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requested = useRef(false)

  const generate = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('generate_company_code')
    setLoading(false)
    if (rpcError || !data) {
      setError('Could not generate a company code. Try again.')
      return
    }
    onChange(String(data))
  }, [onChange])

  useEffect(() => {
    if (value || requested.current) return
    requested.current = true
    void generate()
  }, [generate, value])

  return (
    <Field
      label="Company code"
      htmlFor="companyCode"
      hint="Generated for your organization. Regenerate if you need a different one."
      error={error}
    >
      <div className="flex gap-2">
        <Input
          id="companyCode"
          value={value}
          disabled
          placeholder={loading ? 'Generating…' : 'SENT-XXXXXXXXXX'}
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
