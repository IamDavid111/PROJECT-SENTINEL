import { Alert, Badge, Button, Card, FileUpload, Icon, Skeleton } from '../../components/ui'
import type { IncidentEvidence } from './incidentTypes'
import { SectionTitle } from './IncidentDetailSection'

export function IncidentEvidenceCard({ className, files, loading, loadError, message, error, uploadPending, downloadPending, deletePending, onUpload, onDownload, onRemove }: {
  className?: string
  files: IncidentEvidence[]
  loading: boolean
  loadError: boolean
  message: string
  error: string
  uploadPending: boolean
  downloadPending: boolean
  deletePending: boolean
  onUpload: (file: File) => void
  onDownload: (id: string) => void
  onRemove: (file: IncidentEvidence) => void
}) {
  return (
    <Card className={`h-full p-5 shadow-none ${className ?? ''}`}>
      <SectionTitle
        title="Evidence"
        description="Private, organization-scoped files up to 10 MB."
        action={<Badge tone="neutral">{files.length}</Badge>}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <FileUpload
          variant="compact"
          files={[]}
          onRemove={() => undefined}
          onFilesSelected={(selected) => { if (selected[0]) onUpload(selected[0]) }}
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          maxSizeMb={10}
          label="Upload evidence"
          disabled={uploadPending}
        />
        <span className="text-xs text-muted">Images, video, audio, PDF, Office, or text.</span>
      </div>

      {error && <Alert tone="danger" className="mt-4">{error}</Alert>}
      {message && <Alert tone="success" className="mt-4">{message}</Alert>}
      {loadError && <Alert tone="danger" className="mt-4">Unable to load evidence.</Alert>}

      {loading ? (
        <Skeleton className="mt-4 h-16" />
      ) : files.length ? (
        <div className="mt-4 grid gap-2">
          {files.map((file) => (
            <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <Icon name="file" size={15} className="shrink-0 text-muted" />
                <div className="grid min-w-0">
                  <span className="truncate text-sm font-medium text-foreground">{file.originalFilename}</span>
                  <span className="text-[11px] text-muted">{file.mimeType} · {Math.ceil(file.fileSize / 1024)} KB</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" disabled={downloadPending} onClick={() => onDownload(file.id)}>
                  Download
                </Button>
                <Button variant="ghost" size="sm" className="text-danger" disabled={deletePending} onClick={() => onRemove(file)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">No evidence has been attached.</p>
      )}
    </Card>
  )
}
