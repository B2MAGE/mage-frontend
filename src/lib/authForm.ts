export type ApiErrorResponse = {
  code?: string
  message?: string
  details?: Record<string, string>
}

export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function parseApiError(response: Response) {
  try {
    const payload = (await response.json()) as ApiErrorResponse
    return payload
  } catch {
    return null
  }
}
