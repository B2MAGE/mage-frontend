export const HANDLE_INPUT_MAX_LENGTH = 31

const HANDLE_INPUT_PATTERN = /^@[a-z][a-z0-9_]{2,29}$/i

export const HANDLE_FORMAT_ERROR =
  'Start with @, then use 3–30 letters, numbers, or underscores. The first character after @ must be a letter.'

export function formatHandleInput(handle: string | undefined) {
  const trimmedHandle = handle?.trim().replace(/^@/, '') ?? ''
  return trimmedHandle ? `@${trimmedHandle}` : ''
}

export function validateHandleInput(handle: string) {
  const trimmedHandle = handle.trim()

  if (!trimmedHandle) {
    return 'Handle is required.'
  }

  if (!HANDLE_INPUT_PATTERN.test(trimmedHandle)) {
    return HANDLE_FORMAT_ERROR
  }

  return undefined
}
