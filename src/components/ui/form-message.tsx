import { Alert } from './alert'

/** Inline error/success banner for forms. */
export function FormMessage({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null
  return <Alert tone={error ? 'danger' : 'success'}>{error || success}</Alert>
}