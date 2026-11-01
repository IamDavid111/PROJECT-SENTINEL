import type { UseFormReturn } from 'react-hook-form'

import { Field, FormFull, FormGrid, FormSection, Input, Textarea } from '../../components/ui'
import type { IncidentFormValues } from './incidentSchemas'
import { selectClassName } from './reportFormStyles'

export function ReportStagePeople({ form, reporterName, shifts }: {
  form: UseFormReturn<IncidentFormValues>
  reporterName: string
  shifts: string[]
}) {
  return (
    <FormSection title="Who was involved?" description="People, immediate response, and initial cause.">
      <FormGrid>
        <Field label="Reporter name" htmlFor="incident-reporter">
          <Input id="incident-reporter" value={reporterName} readOnly aria-readonly="true" />
        </Field>
        <Field label="Contractor involved" htmlFor="incident-contractor" error={form.formState.errors.contractorOrganization?.message}>
          <Input id="incident-contractor" {...form.register('contractorOrganization')} placeholder="Contractor involved" />
        </Field>
        <Field label="Shift" htmlFor="incident-shift">
          <select id="incident-shift" {...form.register('shift')} className={selectClassName}>
            <option value="">Select shift</option>
            {shifts.map((shift) => <option value={shift} key={shift}>{shift}</option>)}
          </select>
        </Field>
        <FormFull>
          <Field label="People involved" htmlFor="incident-people">
            <Textarea id="incident-people" rows={3} {...form.register('peopleInvolved')} placeholder="Names, roles and injuries sustained" />
          </Field>
        </FormFull>
        <FormFull>
          <Field label="Immediate actions taken" htmlFor="incident-immediate" required error={form.formState.errors.immediateCorrection?.message}>
            <Textarea id="incident-immediate" rows={4} {...form.register('immediateCorrection')} placeholder="Describe immediate controls, first aid, isolation, notification, or other response." />
          </Field>
        </FormFull>
        <FormFull>
          <Field label="Potential root cause" htmlFor="incident-root-cause">
            <Textarea id="incident-root-cause" rows={3} {...form.register('potentialRootCause')} placeholder="Initial indication only; formal root-cause analysis follows later." />
          </Field>
        </FormFull>
      </FormGrid>
    </FormSection>
  )
}
