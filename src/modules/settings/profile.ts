import { parseApiError } from '@shared/lib'
import type { AuthenticatedFetch } from '@auth'
import type { ProfileNameFields, ProfileSaveResult, UserProfileResponse } from './types'

export const PROFILE_SAVE_UNAVAILABLE_MESSAGE =
  'Profile updates are unavailable right now. Please try again in a moment.'

export async function saveUserProfile(
  authenticatedFetch: AuthenticatedFetch,
  nameFields: ProfileNameFields,
): Promise<ProfileSaveResult & { user?: UserProfileResponse }> {
  try {
    const response = await authenticatedFetch('/users/me', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(nameFields),
    })

    if (!response.ok) {
      const apiError = await parseApiError(response)

      return {
        ok: false,
        details: apiError?.details ?? {},
        message: apiError?.message ?? PROFILE_SAVE_UNAVAILABLE_MESSAGE,
      }
    }

    return {
      ok: true,
      user: (await response.json()) as UserProfileResponse,
    }
  } catch {
    return {
      ok: false,
      details: {},
      message: PROFILE_SAVE_UNAVAILABLE_MESSAGE,
    }
  }
}
