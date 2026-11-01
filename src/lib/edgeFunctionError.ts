// Edge Function errors may carry an HTTP response body; prefer its JSON message,
// fall back to text, then use the SDK error.
export async function getEdgeFunctionErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : 'Unable to complete the request.'
  const response = (error as { context?: Response } | null)?.context
  if (!response) return fallback

  try {
    const payload = await response.clone().json() as { error?: string; message?: string }
    return payload.error || payload.message || fallback
  } catch {
    try {
      return (await response.clone().text()) || fallback
    } catch {
      return fallback
    }
  }
}