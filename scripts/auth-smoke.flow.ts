import { randomUUID } from 'node:crypto'
import { expect, test } from 'vitest'
import { fetchAuthenticatedUser, loginWithCredentials, registerLocalAccount } from '../src/modules/auth/client'

// This uses the application's real HTTP client against a running backend, not a mock.
test('register → login → authenticated current user, including invalid credentials/tokens', async () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 16)
  const account = {
    firstName: 'Auth', lastName: 'Check', displayName: 'Auth smoke check',
    handle: `check_${suffix}`, email: `auth-${suffix}@example.test`,
    password: `Check!${randomUUID()}`,
  }
  const registered = await registerLocalAccount({ ...account, handle: `@${account.handle}` })
  expect(registered.status, 'Registration must succeed on the selected backend').toBe(201)
  const created = await registered.json()
  expect(created.handle).toBe(account.handle)

  const rejectedLogin = await loginWithCredentials({ email: account.email, password: 'Incorrect-password!' })
  expect(rejectedLogin.status).toBe(401)
  const loggedIn = await loginWithCredentials({ email: account.email, password: account.password })
  expect(loggedIn.status).toBe(200)
  const session = await loggedIn.json()
  expect(typeof session.accessToken).toBe('string')
  expect(session.accessToken.length).toBeGreaterThan(10)

  const current = await fetchAuthenticatedUser(session.accessToken)
  expect(current.status, 'The frontend must send the issued bearer token correctly').toBe(200)
  const user = await current.json()
  expect(user.userId).toBe(created.userId)
  expect(user.email).toBe(account.email)
  expect(user.handle).toBe(account.handle)
  expect((await fetchAuthenticatedUser('')).status).toBe(401)
  expect((await fetchAuthenticatedUser('invalid-smoke-token')).status).toBe(401)
}, 60_000)
