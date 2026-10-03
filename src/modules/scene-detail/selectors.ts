import type { SceneDetailErrorCode } from './types'

export function readInitial(value: string) {
  const trimmedValue = value.trim()

  return trimmedValue ? trimmedValue.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() : 'M'
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
      description: 'This scene link isn’t valid. Check the address or explore other scenes.',
    }
  }

  if (errorCode === 'auth-required') {
    return {
      title: 'Sign in to view this scene',
      description:
        'Sign in to your MAGE account to open this scene.',
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
      title: 'This scene couldn’t be loaded',
      description:
        'Something is missing from this scene. You can explore other scenes while it’s being fixed.',
    }
  }

  return {
    title: 'Unable to load this scene',
    description: 'MAGE could not load this scene right now. Please try again in a moment.',
  }
}
