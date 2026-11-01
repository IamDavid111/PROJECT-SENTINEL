import type { UseFormReturn } from 'react-hook-form'

import { Field, FormFull, FormGrid, FormSection, Input } from '../../components/ui'
import type { IncidentFormValues } from './incidentSchemas'
import { selectClassName } from './reportFormStyles'

type SiteOption = { id: string; name: string }

export function ReportStageLocation({ form, configuredSites, departments }: {
  form: UseFormReturn<IncidentFormValues>
  configuredSites: SiteOption[]
  departments: string[]
}) {
  return (
    <FormSection title="Where and under what conditions?" description="Site and environmental context for the event.">
      <FormGrid>
        <Field label="Site" htmlFor="incident-site" required error={form.formState.errors.siteId?.message}>
          <select id="incident-site" {...form.register('siteId')} className={selectClassName}>
            <option value="">{configuredSites.length ? 'Select site' : 'No sites configured'}</option>
            {configuredSites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}
          </select>
        </Field>
        <Field label="Department" htmlFor="incident-department">
          <select id="incident-department" {...form.register('department')} className={selectClassName}>
            <option value="">Select department</option>
            {departments.map((department) => <option value={department} key={department}>{department}</option>)}
          </select>
        </Field>
        <Field label="Facility / area" htmlFor="incident-location" error={form.formState.errors.location?.message}>
          <Input id="incident-location" {...form.register('location')} placeholder="Area, unit, or precise location" />
        </Field>
        <Field label="Weather conditions" htmlFor="incident-weather">
          <Input id="incident-weather" {...form.register('weatherConditions')} placeholder="32°C, light rain, wind 12 kt" />
        </Field>
        <FormFull>
          <Field label="Equipment involved" htmlFor="incident-equipment">
            <Input id="incident-equipment" {...form.register('equipmentInvolved')} placeholder="Equipment or vehicle involved" />
          </Field>
        </FormFull>
      </FormGrid>
    </FormSection>
  )
}
