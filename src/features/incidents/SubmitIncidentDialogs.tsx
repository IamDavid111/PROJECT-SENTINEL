import { Button, Dialog } from '../../components/ui'

export function SubmitIncidentDialogs({ confirmationOpen, successOpen, isSubmitting, draftReference, submitMessage, onCloseConfirmation, onCloseSuccess, onSubmit, onViewIncidents }: {
  confirmationOpen: boolean
  successOpen: boolean
  isSubmitting: boolean
  draftReference: string
  submitMessage: string
  onCloseConfirmation: () => void
  onCloseSuccess: () => void
  onSubmit: () => void
  onViewIncidents: () => void
}) {
  return (
    <>
      <Dialog
        open={confirmationOpen}
        onClose={onCloseConfirmation}
        title="Submit this incident?"
        description="Once submitted, the report moves to the incident register and can no longer be edited here."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={onCloseConfirmation}>Keep editing</Button>
            <Button size="sm" loading={isSubmitting} onClick={onSubmit}>Submit incident</Button>
          </>
        }
      >
        <p className="text-sm text-muted">The report will be saved with reference {draftReference || 'generated on submission'}.</p>
      </Dialog>

      <Dialog
        open={successOpen}
        onClose={onCloseSuccess}
        title="Incident submitted"
        description="The report is now in the incident register."
        closeOnBackdrop={false}
        closeOnEscape={false}
        footer={<Button size="sm" onClick={onViewIncidents}>View incidents</Button>}
      >
        <p className="text-sm text-muted">{submitMessage || 'The incident report was submitted successfully.'}</p>
      </Dialog>
    </>
  )
}
