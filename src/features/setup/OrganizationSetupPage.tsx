import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'

import {
  Alert,
  Button,
  Field,
  FileUpload,
  FormActions,
  FormFull,
  FormGrid,
  FormSection,
  Icon,
  Input,
  Select,
  Stepper,
  type FileUploadItem,
} from '../../components/ui'
import { getCountriesForRegion, getCountryOption, getCountryRegion, worldRegions } from '../../lib/locations'
import { organizationSetupSchema, type OrganizationSetupFormValues } from '../../lib/schemas'
import { supabase } from '../../lib/supabase'
import { AuthLayout } from '../auth/AuthLayout'
import { CompanyCodeField } from '../auth/CompanyCodeField'
import { loadPendingRegistration, pendingRegistrationKey } from '../auth/pendingRegistration'

const INDUSTRIES = ['Oil & Gas', 'Mining', 'Power & Utilities', 'Construction', 'Manufacturing']
const COMPANY_SIZES = ['1-50', '51-250', '251-1,000', '1,001+']

// If email confirmation interrupted registration, restore the saved organization details and create the organization and owner together.
// Logo upload and linking are separate steps afterward, so a logo error does not undo successful organization creation.
export function OrganizationSetupPage({ email }: { email: string }) {
  const pending = useMemo(() => loadPendingRegistration(), [])
  const pendingCountryRegion = getCountryRegion(getCountryOption(pending.country || '')?.code || '')
  const pendingRegion = worldRegions.find((region) => region === pending.region)
  const [step, setStep] = useState(0)
  const [companyCode, setCompanyCode] = useState(pending.companyCode || '')
  const [logo, setLogo] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const form = useForm<OrganizationSetupFormValues>({
    resolver: zodResolver(organizationSetupSchema),
    defaultValues: {
      companyName: pending.companyName || '',
      companyRegistrationNumber: pending.companyRegistrationNumber || '',
      companyType: pending.companyType || '',
      industry: pending.industry || '',
      companySize: pending.companySize || '',
      region: pendingCountryRegion
        ? pendingRegion === pendingCountryRegion ? pendingRegion : pendingCountryRegion
        : pendingRegion || '',
      country: pending.country || '',
      state: pending.state || '',
      address: pending.address || '',
      contactEmail: pending.contactEmail || '',
      contactPhone: pending.contactPhone || '',
      adminName: pending.adminName || '',
    },
  })

  const region = form.watch('region')
  const country = form.watch('country')
  const stateOptions = getCountryOption(country)?.regions ?? []
  const countryOptions = getCountriesForRegion(region)
  const errors = form.formState.errors as Record<string, { message?: string } | undefined>
  const errorFor = (name: keyof OrganizationSetupFormValues) => errors[name]?.message

  const logoFiles: FileUploadItem[] = logo
    ? [{ id: 'logo', name: logo.name, size: logo.size, type: logo.type }]
    : []

  const next = async () => {
    setError('')
    if (!companyCode) {
      setError('Generate a company code before continuing.')
      return
    }
    const valid = await form.trigger([
      'companyName',
      'industry',
      'companyType',
      'companySize',
      'companyRegistrationNumber',
      'region',
      'country',
      'state',
      'address',
      'contactEmail',
      'contactPhone',
    ])
    if (valid) setStep(1)
  }

  const submit = async (data: OrganizationSetupFormValues) => {
    setError('')
    setMessage('')
    if (!companyCode) {
      setError('Generate a company code before creating the organization.')
      return
    }
    setLoading(true)

    const { data: organization, error: organizationError } = await supabase.rpc('create_organization_with_owner', {
      organization_data: {
        company_code: companyCode,
        company_name: data.companyName,
        logo_url: '',
        industry: data.industry,
        company_registration_number: data.companyRegistrationNumber || '',
        company_type: data.companyType || '',
        company_size: data.companySize,
        region: data.region,
        country: data.country,
        state: data.state,
        address: data.address || '',
        contact_email: data.contactEmail,
        contact_phone: data.contactPhone,
      },
      owner_full_name: data.adminName,
    })

    if (organizationError || !organization) {
      setLoading(false)
      setError(organizationError?.message || 'The organization could not be created.')
      return
    }

    const { data: { user } } = await supabase.auth.getUser()

    if (logo) {
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
      await supabase.from('activity_logs').insert({
        organization_id: organization.id,
        user_id: user.id,
        activity: 'Organization setup completed',
        metadata: { organization_id: organization.id },
      })
    }

    localStorage.removeItem(pendingRegistrationKey)
    setLoading(false)
    setMessage('Organization created. Opening your workspace...')
    window.setTimeout(() => window.location.reload(), 800)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.hash = '#top'
  }

  return (
    <AuthLayout
      title="Finish setting up your workspace"
      subtitle="Your account is confirmed. Add your organization details to become its first Super Administrator."
      width="wide"
      step={
        <Stepper
          steps={[
            { id: 'company', label: 'Company details' },
            { id: 'admin', label: 'Administrator' },
          ]}
          activeIndex={step}
          onStepClick={(index) => {
            if (index < step) setStep(index)
          }}
        />
      }
      footer={
        <p className="text-center text-sm text-muted">
          <button type="button" onClick={() => void signOut()} className="font-medium text-brand-dark underline-offset-4 hover:underline">
            Sign out
          </button>
        </p>
      }
    >
      <form className="grid gap-6" onSubmit={form.handleSubmit(submit)} noValidate>
        {step === 0 ? (
          <FormSection title="Company details" description="These details appear on reports, actions and audit records.">
            <FormGrid>
              <Field label="Company name" htmlFor="companyName" required error={errorFor('companyName')}>
                <Input id="companyName" placeholder="Acme Energy Ltd" autoComplete="organization" {...form.register('companyName')} />
              </Field>
              <Field label="Industry" htmlFor="industry" required error={errorFor('industry')}>
                <Select id="industry" {...form.register('industry')}>
                  <option value="">Select industry</option>
                  {INDUSTRIES.map((industry) => <option key={industry}>{industry}</option>)}
                </Select>
              </Field>
              <Field label="Company type" htmlFor="companyType">
                <Input id="companyType" placeholder="Private limited" {...form.register('companyType')} />
              </Field>
              <Field label="Company size" htmlFor="companySize" required error={errorFor('companySize')}>
                <Select id="companySize" {...form.register('companySize')}>
                  <option value="">Select size</option>
                  {COMPANY_SIZES.map((size) => <option key={size}>{size}</option>)}
                </Select>
              </Field>
              <Field label="Registration number" htmlFor="companyRegistrationNumber">
                <Input id="companyRegistrationNumber" placeholder="Optional" {...form.register('companyRegistrationNumber')} />
              </Field>
              <Field label="Region" htmlFor="region" required error={errorFor('region')}>
                <Select
                  id="region"
                  {...form.register('region', {
                    onChange: () => {
                      form.setValue('country', '', { shouldDirty: true, shouldValidate: true })
                      form.setValue('state', '', { shouldDirty: true, shouldValidate: true })
                    },
                  })}
                >
                  <option value="">Select region</option>
                  {worldRegions.map((region) => <option key={region}>{region}</option>)}
                </Select>
              </Field>
              <Field label="Country" htmlFor="country" required error={errorFor('country')}>
                <Select
                  id="country"
                  disabled={!region}
                  {...form.register('country', {
                    onChange: () => form.setValue('state', '', { shouldDirty: true, shouldValidate: true }),
                  })}
                >
                  <option value="">{region ? 'Select country' : 'Select a region first'}</option>
                  {countryOptions.map((option) => <option value={option.name} key={option.code}>{option.name}</option>)}
                </Select>
              </Field>
              <Field label="State / Province" htmlFor="state" required error={errorFor('state')}>
                {stateOptions.length > 0 ? (
                  <Select id="state" disabled={!country} {...form.register('state')}>
                    <option value="">{country ? 'Select state or province' : 'Select a country first'}</option>
                    {stateOptions.map(([name, code]) => <option value={name} key={code}>{name}</option>)}
                  </Select>
                ) : (
                  <Input
                    id="state"
                    disabled={!country}
                    placeholder={country ? 'Enter state or province (or Not applicable)' : 'Select a country first'}
                    {...form.register('state')}
                  />
                )}
              </Field>
              <FormFull>
                <Field label="Address" htmlFor="address">
                  <Input id="address" placeholder="Company address" {...form.register('address')} />
                </Field>
              </FormFull>
              <FormFull>
                <CompanyCodeField value={companyCode} onChange={setCompanyCode} />
              </FormFull>
              <Field label="Contact email" htmlFor="contactEmail" required error={errorFor('contactEmail')}>
                <Input id="contactEmail" type="email" placeholder="contact@company.com" {...form.register('contactEmail')} />
              </Field>
              <Field label="Contact phone" htmlFor="contactPhone" required error={errorFor('contactPhone')}>
                <Input id="contactPhone" type="tel" placeholder="+234 ..." {...form.register('contactPhone')} />
              </Field>
              <FormFull>
                <div className="grid gap-1.5">
                  <span className="text-sm font-medium text-foreground">Company logo</span>
                  <FileUpload
                    files={logoFiles}
                    accept="image/*"
                    maxSizeMb={5}
                    variant="compact"
                    label="Upload company logo"
                    onFilesSelected={(files) => setLogo(files[0] ?? null)}
                    onRemove={() => setLogo(null)}
                  />
                  <p className="text-xs text-muted">Optional · PNG or JPG, up to 5 MB.</p>
                </div>
              </FormFull>
            </FormGrid>
          </FormSection>
        ) : (
          <FormSection title="Administrator account" description="This account becomes the organization's first Super Administrator.">
            <FormGrid>
              <Field label="Full name" htmlFor="adminName" required error={errorFor('adminName')}>
                <Input id="adminName" placeholder="Your full name" autoComplete="name" {...form.register('adminName')} />
              </Field>
              <Field label="Work email" htmlFor="setupEmail" hint="This is the account completing setup.">
                <Input id="setupEmail" value={email} readOnly />
              </Field>
            </FormGrid>
          </FormSection>
        )}

        {error && <Alert tone="danger">{error}</Alert>}
        {message && <Alert tone="success">{message}</Alert>}

        <FormActions>
          {step === 1 && (
            <Button type="button" variant="outline" onClick={() => setStep(0)} disabled={loading}>
              Back
            </Button>
          )}
          {step === 0 ? (
            <Button type="button" onClick={() => void next()}>
              Continue <Icon name="arrowRight" size={15} />
            </Button>
          ) : (
            <Button type="submit" loading={loading}>
              Create organization <Icon name="arrowRight" size={15} />
            </Button>
          )}
        </FormActions>
      </form>
    </AuthLayout>
  )
}
