import { Button, Dialog, Field, FormMessage, Input } from '../../../components/ui'

export function DepartmentDialog({ open, onClose, name, setName, loading, error, onSave }: {
  open: boolean
  onClose: () => void
  name: string
  setName: (value: string) => void
  loading: boolean
  error: string
  onSave: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create department"
      description="Add a department to the organization settings used by invites and filters."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={onSave}>Save department</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Department name" htmlFor="department-name" required>
          <Input id="department-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Process Safety" autoFocus />
        </Field>
        <FormMessage error={error} />
      </div>
    </Dialog>
  )
}
