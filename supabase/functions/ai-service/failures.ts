import { type AiErrorResponse, aiErrorSchema } from '../_shared/aiContracts.ts'

// Public messages come from our code, not provider bodies or caught exception messages.
export function buildAiFailure(requestId: string, message: string, status: number): AiErrorResponse {
  const codes: Record<number, AiErrorResponse['error']['code']> = {
    400: 'invalid_request',
    401: 'authentication_required',
    403: 'access_denied',
    405: 'method_not_allowed',
    409: 'conflict',
    422: 'session_limit',
    429: 'rate_limited',
    500: 'internal_error',
    502: 'provider_error',
    503: 'service_unavailable',
    504: 'request_timeout',
  }
  return aiErrorSchema.parse({
    contractVersion: '1',
    requestId,
    ok: false,
    error: {
      code: codes[status] ?? 'internal_error',
      message,
      // Retryability is guidance only; the service never automatically repeats billable requests.
      retryable: status === 429 || status === 502 || status === 503 || status === 504,
    },
  })
}

export function isAiTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}
