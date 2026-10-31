import type { FormEvent } from 'react'

import { Button, Card, Field, FormGrid, FormSection, Input, Select } from '../../../components/ui'
import type { DepartmentOption } from '../../settings/companySettingsTypes'

export function InviteUserCard({ email, onEmailChange, department, onDepartmentChange, role, onRoleChange, departments, roleOptions, canManageRolesPermissions, loading, onSubmit, onCreateDepartment, onCreateRole }: {
  email: string
  onEmailChange: (value: string) => void
  department: string
  onDepartmentChange: (value: string) => void
  role: string
  onRoleChange: (value: string) => void
  departments: DepartmentOption[]
  roleOptions: Array<{ id: string; label: string; value: string }>
  canManageRolesPermissions: boolean
  loading: boolean
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCreateDepartment: () => void
  onCreateRole: () => void
}) {
  return (
    <Card className="p-5 shadow-none">
      <form onSubmit={onSubmit}>
        <FormSection title="Invite a user" description="Invitation emails expire after 24 hours.">
          <FormGrid>
            <Field label="Work email" htmlFor="invite-email" required>
              <Input id="invite-email" type="email" value={email} onChange={(event) => onEmailChange(event.target.value)} placeholder="name@company.com" required />
            </Field>
            <Field label="Department" htmlFor="invite-department">
              <Select
                id="invite-department"
                value={department}
                onChange={(event) => {
                  if (event.target.value === '__create_new_department__') {
                    onCreateDepartment()
                    return
                  }
                  onDepartmentChange(event.target.value)
                }}
              >
                <option value="">Select department</option>
                {departments.map((item) => <option value={item.name} key={item.name}>{item.name}</option>)}
                <option value="__create_new_department__">Create new department…</option>
              </Select>
            </Field>
            <Field label="Role" htmlFor="invite-role">
              <Select
                id="invite-role"
                value={role}
                onChange={(event) => {
                  if (event.target.value === '__create_new_role__') {
                    onCreateRole()
                    return
                  }
                  onRoleChange(event.target.value)
                }}
              >
                {roleOptions.map((item) => <option value={item.value} key={item.id}>{item.label}</option>)}
                {canManageRolesPermissions && <option value="__create_new_role__">Create new role…</option>}
              </Select>
            </Field>
          </FormGrid>
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>Send invite</Button>
          </div>
        </FormSection>
      </form>
    </Card>
  )
}
