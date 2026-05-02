import { parseApiError } from '@shared/lib'
import type { AuthenticatedFetch } from '@auth'
import type { PasswordChangeFields, PasswordChangeResult } from './types'

export const PASSWORD_CHANGE_UNAVAILABLE_MESSAGE =
  'Password changes are unavailable right now. Please try again in a moment.'

export async function changePassword(
  authenticatedFetch: AuthenticatedFetch,
  fields: PasswordChangeFields,
): Promise<PasswordChangeResult> {
  try {
    const response = await authenticatedFetch('/users/me/password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fields),
    })

    if (!response.ok) {
      const apiError = await parseApiError(response)

      return {
        ok: false,
        code: apiError?.code,
        details: apiError?.details ?? {},
        message: apiError?.message ?? PASSWORD_CHANGE_UNAVAILABLE_MESSAGE,
      }
    }

    return { ok: true }
  } catch {
    return {
      ok: false,
      details: {},
      message: PASSWORD_CHANGE_UNAVAILABLE_MESSAGE,
    }
  }
}
