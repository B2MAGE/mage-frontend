import type { SceneDetailErrorCode } from './types'

export function readInitial(value: string) {
  const trimmedValue = value.trim()

  return trimmedValue ? trimmedValue[0].toUpperCase() : 'M'
}

export function readSceneId(value: string | undefined) {
  if (!value) {
    return null
  }

  const parsedValue = Number(value)

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    return null
  }

  return parsedValue
}

export function readErrorCopy(errorCode: SceneDetailErrorCode) {
  if (errorCode === 'invalid-id') {
    return {
      title: 'Invalid scene link',
      description: 'This route is missing a valid scene id. Check the URL and try again.',
    }
  }

  if (errorCode === 'auth-required') {
    return {
      title: 'Sign in to view this scene',
      description:
        'Scene detail requests are still authenticated in this build. Sign in, then reopen this scene route.',
    }
  }

  if (errorCode === 'not-found') {
    return {
      title: 'Scene not found',
      description: 'This scene does not exist or is no longer available.',
    }
  }

  if (errorCode === 'invalid-payload') {
    return {
      title: 'Unable to render this scene',
      description:
        'The backend returned scene detail data, but the scene payload is missing fields required by the player.',
    }
  }

  return {
    title: 'Unable to load this scene',
    description: 'MAGE could not load this scene right now. Please try again in a moment.',
  }
}
