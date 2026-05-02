# Auth Module

This directory is the frontend-owned boundary for authentication and session behavior.

## Public API

Import route-facing auth behavior through `@modules/auth` or the stable `@auth` alias.

Exports:

- `AuthProvider`
- `useAuth()`
- `AUTH_SESSION_STORAGE_KEY`
- `ProtectedRoute`
- `GuestOnlyRoute`
- `LoginPage`
- `ForgotPasswordPage`
- `RegisterPage`

## Internal Responsibilities

- `AuthProvider.tsx`
  Session state orchestration and bootstrap wiring.
- `storage.ts`
  Stored-session parsing and persistence.
- `client.ts`
  Auth bootstrap fetches, authenticated requests, and login/register request helpers.
- `guards.tsx`
  Protected-route and guest-route behavior.
- `LoginPage.tsx` and `RegisterPage.tsx`
  Route-facing auth UI.
- `ForgotPasswordPage.tsx`
  Password-recovery request UI.

## Integration Rules

1. App bootstrap should mount `AuthProvider` once in app-level providers.
2. Other surfaces should consume auth state through `useAuth()` or `authenticatedFetch()`, not by reading storage directly.
3. Route guards should come from this module, not from app wiring.

## Session Model

The auth module stores the active session under:

```text
mage.auth.session
```

The module is responsible for:

- persisting the access token
- restoring the session on app startup
- verifying the stored token through `GET /api/users/me`
- exposing `authenticatedFetch()` for protected API calls
- clearing auth state on logout or invalid-token responses

## Route Surfaces

### `/login`

Access:

- guest-only
- authenticated users are redirected to `/`

Request flow:

- `POST /api/auth/login`
- `GET /api/users/me` during session bootstrap

Expected login body:

```json
{
  "email": "user@example.com",
  "password": "example-password"
}
```

User-facing behavior:

- validates required fields and email format on the client
- disables submit while the request is in flight
- stores the issued `accessToken` and user snapshot through the auth provider
- redirects to `/` after a successful login
- shows field-level and form-level backend errors when available
- shows a registration success notice when arriving from the registration flow
- links to `/forgot-password` for password recovery

Failure modes:

- `401` is surfaced as an invalid-credentials error
- missing `accessToken` in an otherwise successful response is treated as a frontend error
- network failures show a generic unavailable message
- invalid stored sessions are removed automatically during auth bootstrap

### `/forgot-password`

Access:

- guest-only
- authenticated users are redirected to `/`

Request flow:

- `POST /api/auth/reset-password/request`

Expected request body:

```json
{
  "email": "user@example.com"
}
```

User-facing behavior:

- validates required input and email format on the client
- pre-fills the email field when arriving from the login page with a typed address
- disables submit while the request is in flight
- shows a neutral confirmation state after a successful request
- links back to `/login` after the request is submitted

Failure modes:

- backend validation details are surfaced on the email field when available
- network or server failures show a generic unavailable message
- successful responses do not reveal whether the submitted email exists

### `/register`

Access:

- guest-only
- authenticated users are redirected away through the shared route guard

Request flow:

- `POST /api/auth/register`

Expected registration body:

```json
{
  "firstName": "Example",
  "lastName": "User",
  "displayName": "Example User",
  "email": "user@example.com",
  "password": "example-password"
}
```

User-facing behavior:

- validates first name, last name, display name, email, and password before submission
- requires minimum lengths for name fields and password
- surfaces backend validation details for all supported fields
- redirects to `/login` on success
- passes the registered email and a success notice into login page state
- explains that display name is the public name shown on scenes and comments

Current limitations:

- successful registration does not automatically create an authenticated session
- OAuth-based sign-up is not handled from this page

## Tests

Coverage lives in the colocated auth specs under `src/modules/auth/`.
