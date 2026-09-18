import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { countries, worldRegions } from '../../lib/locations'
import { organizationSetupSchema } from '../../lib/schemas'
import { supabase } from '../../lib/supabase'

export const pendingRegistrationKey = 'sentinel-pending-org-registration'

type PendingRegistration = {
  companyCode?: string
  companyName?: string
  companyRegistrationNumber?: string
  companyType?: string
  industry?: string
  companySize?: string
  region?: string
  country?: string
  state?: string
  address?: string
  contactEmail?: string
  contactPhone?: string
  adminName?: string
}

function loadPendingRegistration(): PendingRegistration {
  try {
    const raw = localStorage.getItem(pendingRegistrationKey)
    return raw ? (JSON.parse(raw) as PendingRegistration) : {}
  } catch {
    return {}
  }
}

export function OrganizationSetupPage({ email }: { email: string }) {
  const pending = useMemo<PendingRegistration>(() => loadPendingRegistration(), [])
  const [companyCode, setCompanyCode] = useState(() => pending.companyCode || `SENT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`)
  const [region, setRegion] = useState(pending.region || '')
  const [country, setCountry] = useState(pending.country || '')
  const [selectedState, setSelectedState] = useState(pending.state || '')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setMessage('')
    const form = new FormData(event.currentTarget)
    const values = {
      companyCode: companyCode.trim().toUpperCase(),
      companyName: String(form.get('companyName') || ''),
      companyRegistrationNumber: String(form.get('companyRegistrationNumber') || ''),
      companyType: String(form.get('companyType') || ''),
      industry: String(form.get('industry') || ''),
      companySize: String(form.get('companySize') || ''),
      region,
      country,
      state: selectedState,
      address: String(form.get('address') || ''),
      contactEmail: String(form.get('contactEmail') || ''),
      contactPhone: String(form.get('contactPhone') || ''),
      adminName: String(form.get('adminName') || ''),
    }
    const parsed = organizationSetupSchema.safeParse(values)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || 'Check the organization details and try again.')
      return
    }

    setLoading(true)
    const { data: organization, error: organizationError } = await supabase.rpc('create_organization_with_owner', {
      organization_data: {
        company_code: parsed.data.companyCode,
        company_name: parsed.data.companyName,
        logo_url: '',
        industry: parsed.data.industry,
        company_registration_number: parsed.data.companyRegistrationNumber,
        company_type: parsed.data.companyType,
        company_size: parsed.data.companySize,
        region: parsed.data.region,
        country: parsed.data.country,
        state: parsed.data.state,
        address: parsed.data.address,
        contact_email: parsed.data.contactEmail,
        contact_phone: parsed.data.contactPhone,
      },
      owner_full_name: parsed.data.adminName,
    })
    if (organizationError || !organization) {
      setLoading(false)
      setError(organizationError?.message || 'The organization could not be created.')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    const logo = form.get('logo')
    if (logo instanceof File && logo.size > 0) {
      if (!logo.type.startsWith('image/') || logo.size > 5 * 1024 * 1024) {
        setLoading(false)
        setError('Organization created, but the logo must be an image smaller than 5 MB. Reload to enter your workspace.')
        return
      }
      const logoPath = `${organization.id}/${crypto.randomUUID()}-${logo.name}`
      const { error: uploadError } = await supabase.storage.from('organization-assets').upload(logoPath, logo, { upsert: false })
      if (uploadError) {
        setLoading(false)
        setError(`Organization created, but logo upload failed: ${uploadError.message}`)
        return
      }
      const { error: logoUpdateError } = await supabase.from('organizations').update({ logo_url: logoPath }).eq('id', organization.id)
      if (logoUpdateError) {
        setLoading(false)
        setError(`Organization created, but logo linking failed: ${logoUpdateError.message}`)
        return
      }
    }

    if (user) {
      await supabase.from('activity_logs').insert({ organization_id: organization.id, user_id: user.id, activity: 'Organization setup completed', metadata: { organization_id: organization.id } })
    }
    localStorage.removeItem(pendingRegistrationKey)
    setLoading(false)
    setMessage('Organization created. Opening your workspace...')
    window.location.reload()
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.hash = '#top'
  }

  return (
    <div className="workspace-panel organization-setup-panel">
      <div className="eyebrow">COMPLETE ORGANIZATION SETUP</div>
      <h2>Create your company workspace</h2>
      <p>Your account is confirmed. Finish setting up your organization to become its first Super Administrator.</p>
      <form className="auth-form registration-form" onSubmit={submit}>
        <div className="form-section-title">Company details</div>
        <div className="form-grid">
          <label>Company name<input name="companyName" defaultValue={pending.companyName || ''} placeholder="Acme Energy Ltd" /></label>
          <label>Company code<input value={companyCode} onChange={(event) => setCompanyCode(event.target.value.toUpperCase())} maxLength={20} /></label>
          <label>Industry<select name="industry" defaultValue={pending.industry || ''}><option value="" disabled>Select industry</option><option>Oil &amp; Gas</option><option>Mining</option><option>Power &amp; Utilities</option><option>Construction</option><option>Manufacturing</option></select></label>
          <label>Company type<input name="companyType" defaultValue={pending.companyType || ''} placeholder="Private limited" /></label>
          <label>Company size<select name="companySize" defaultValue={pending.companySize || ''}><option value="" disabled>Select size</option><option>1-50</option><option>51-250</option><option>251-1,000</option><option>1,001+</option></select></label>
          <label>Registration number<input name="companyRegistrationNumber" defaultValue={pending.companyRegistrationNumber || ''} placeholder="Optional" /></label>
          <label>Region<select name="region" value={region} onChange={(event) => setRegion(event.target.value)}><option value="" disabled>Select region</option>{worldRegions.map((option) => <option value={option} key={option}>{option}</option>)}</select></label>
          <label>Country<select name="country" value={country} onChange={(event) => { setCountry(event.target.value); setSelectedState('') }}><option value="" disabled>Select country</option>{countries.map((option) => <option value={option.name} key={option.code}>{option.name}</option>)}</select></label>
          <label>State / Province<select name="state" value={selectedState} onChange={(event) => setSelectedState(event.target.value)} disabled={!country}><option value="" disabled>{country ? 'Select state or province' : 'Select a country first'}</option>{countries.find((option) => option.name === country)?.regions.map(([name, code]) => <option value={name} key={code}>{name}</option>)}</select></label>
        </div>
        <label>Address<input name="address" defaultValue={pending.address || ''} placeholder="Company address" /></label>
        <div className="form-grid">
          <label>Contact email<input name="contactEmail" type="email" defaultValue={pending.contactEmail || ''} placeholder="contact@company.com" /></label>
          <label>Contact phone<input name="contactPhone" type="tel" defaultValue={pending.contactPhone || ''} placeholder="+234 ..." /></label>
        </div>
        <label>Company logo <input name="logo" type="file" accept="image/*" /></label>
        <div className="form-section-title">Administrator account</div>
        <div className="form-grid">
          <label>Full name<input name="adminName" defaultValue={pending.adminName || ''} placeholder="Your full name" autoComplete="name" /></label>
          <label>Work email<input value={email} disabled /></label>
        </div>
        {error && <div className="auth-message error" role="alert">{error}</div>}
        {message && <div className="auth-message success" role="status">{message}</div>}
        <button className="button button-green auth-submit" disabled={loading}>{loading ? 'Creating workspace...' : 'Create organization →'}</button>
        <p className="auth-footer-copy"><a href="#top" onClick={(event) => { event.preventDefault(); void signOut() }}>Sign out</a></p>
      </form>
    </div>
  )
}