import { buildApiUrl } from '@shared/lib'

type LoginRequest = {
  email: string
  password: string
}

type RegisterRequest = {
  firstName: string
  lastName: string
  displayName: string
  email: string
  password: string
}

type PasswordResetRequest = {
  email: string
}

export function buildAuthorizationHeaders(headers: HeadersInit | undefined, accessToken: string) {
  const nextHeaders = new Headers(headers)
  nextHeaders.set('Authorization', `Bearer ${accessToken}`)
  return nextHeaders
}

export async function authenticatedRequest(
  accessToken: string,
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const resolvedInput = typeof input === 'string' && input.startsWith('/') ? buildApiUrl(input) : input

  return fetch(resolvedInput, {
    ...init,
    headers: buildAuthorizationHeaders(init.headers, accessToken),
  })
}

export async function fetchAuthenticatedUser(accessToken: string) {
  return authenticatedRequest(accessToken, '/users/me')
}

export async function loginWithCredentials(payload: LoginRequest) {
  return fetch(buildApiUrl('/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function registerLocalAccount(payload: RegisterRequest) {
  return fetch(buildApiUrl('/auth/register'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function requestPasswordReset(payload: PasswordResetRequest) {
  return fetch(buildApiUrl('/auth/reset-password/request'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}
