export type ApiErrorResponse = {
  code?: string
  message?: string
  details?: Record<string, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readApiErrorDetails(value: unknown) {
  if (!isRecord(value)) {
    return undefined
  }

  const stringEntries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  )

  return stringEntries.length > 0 ? Object.fromEntries(stringEntries) : undefined
}

export async function parseApiError(response: Response) {
  try {
    const payload = (await response.json()) as unknown

    if (!isRecord(payload)) {
      return null
    }

    return {
      code: typeof payload.code === 'string' ? payload.code : undefined,
      message: typeof payload.message === 'string' ? payload.message : undefined,
      details: readApiErrorDetails(payload.details),
    } satisfies ApiErrorResponse
  } catch {
    return null
  }
}
