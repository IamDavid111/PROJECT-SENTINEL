import type { UseFormReturn } from 'react-hook-form'

import { Field, FormFull, FormGrid, FormSection, Input, Textarea } from '../../components/ui'
import type { IncidentFormValues } from './incidentSchemas'
import type { IncidentReportType } from './incidentTypes'
import { selectClassName } from './reportFormStyles'

export function ReportStageEvent({ form, categories, severities, currentReportType }: {
  form: UseFormReturn<IncidentFormValues>
  categories: string[]
  severities: string[]
  currentReportType: IncidentReportType
}) {
  return (
    <FormSection title="What happened?" description="Required fields are validated before you can continue.">
      <FormGrid>
        <FormFull>
          <Field label="Incident title" htmlFor="incident-title" required error={form.formState.errors.title?.message}>
            <Input id="incident-title" {...form.register('title')} placeholder="Short factual description" />
          </Field>
        </FormFull>
        <Field label="Incident category" htmlFor="incident-category" required error={form.formState.errors.incidentCategory?.message}>
          <select id="incident-category" {...form.register('incidentCategory')} className={selectClassName}>
            <option value="">Select incident category</option>
            {categories.map((category) => <option value={category} key={category}>{category}</option>)}
          </select>
        </Field>
        <Field label="Severity" htmlFor="incident-severity" required error={form.formState.errors.severity?.message}>
          <select id="incident-severity" {...form.register('severity')} className={selectClassName}>
            <option value="">Select severity</option>
            {severities.map((severity) => <option value={severity} key={severity}>{severity}</option>)}
          </select>
        </Field>
        {currentReportType === 'near_miss' && (
          <Field label="Potential severity" htmlFor="incident-potential-severity" required error={form.formState.errors.potentialSeverity?.message}>
            <select id="incident-potential-severity" {...form.register('potentialSeverity')} className={selectClassName}>
              <option value="">Select potential severity</option>
              {severities.map((severity) => <option value={severity} key={severity}>{severity}</option>)}
            </select>
          </Field>
        )}
        <Field label="Date" htmlFor="incident-date" required error={form.formState.errors.occurrenceDate?.message}>
          <Input id="incident-date" type="date" {...form.register('occurrenceDate')} />
        </Field>
        <Field label="Time" htmlFor="incident-time" required error={form.formState.errors.occurrenceTime?.message}>
          <Input id="incident-time" type="time" {...form.register('occurrenceTime')} />
        </Field>
        <FormFull>
          <Field label="Description" htmlFor="incident-description" required error={form.formState.errors.description?.message}>
            <Textarea id="incident-description" rows={5} {...form.register('description')} placeholder="Describe the sequence of events factually." />
          </Field>
        </FormFull>
        {currentReportType === 'environmental_incident' && (
          <FormFull>
            <Field error={form.formState.errors.environmentalImpact?.message}>
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input type="checkbox" {...form.register('environmentalImpact')} className="mt-0.5 h-4 w-4 accent-brand" />
                Environmental impact identified *
              </label>
            </Field>
          </FormFull>
        )}
      </FormGrid>
    </FormSection>
  )
}
