# Login Page

## Overview

The login page handles local email-and-password sign-in for the frontend. It validates credentials on the client, exchanges them for a bearer token through the backend, and hands the resulting session to the shared auth provider.

Route:

- `/login`

Access:

- guest-only
- authenticated users are redirected to `/`

## Related Files

- `src/modules/auth/LoginPage.tsx`
- `src/modules/auth/client.ts`
- `src/modules/auth/AuthProvider.tsx`
- `src/modules/auth/guards.tsx`
- `src/modules/auth/storage.ts`
- `src/lib/api.ts`
- `src/lib/authForm.ts`
- `src/modules/auth/LoginPage.test.tsx`
- `src/modules/auth/AuthProvider.test.tsx`
- `src/modules/auth/guards.test.tsx`

## Request Flow

Primary request:

- `POST /api/auth/login`

Expected request body:

```json
{
  "email": "user@example.com",
  "password": "example-password"
}
```

Session bootstrap request:

- `GET /api/users/me`

Requests are built through `buildApiUrl()`. For local development, leave `VITE_API_BASE_URL` unset and use the Vite `/api` proxy described in the repository README.

## User-Facing Behavior

- validates required fields before submission
- validates email format on the client
- disables the submit button while the request is in flight
- stores the issued `accessToken` and user snapshot through `completeLoginSession()`
- redirects to `/` after a successful login
- shows field-level and form-level backend errors when available
- shows a registration success notice when arriving from the registration flow
- clears stale or invalid stored sessions when `/api/users/me` returns `401`

## Auth Session Notes

The auth module stores session data under:

```text
mage.auth.session
```

The auth module is responsible for:

- persisting the access token
- restoring the session on app startup
- verifying the stored token through `GET /api/users/me`
- exposing `authenticatedFetch()` for protected API calls
- clearing auth state on logout or invalid-token responses

## Failure Modes

- `401` from login is surfaced as an invalid-credentials error
- missing `accessToken` in an otherwise successful response is treated as a frontend error
- network failures show a generic unavailable message
- invalid stored sessions are removed automatically during auth bootstrap

## Tests

Main coverage lives in:

- `src/modules/auth/LoginPage.test.tsx`
- `src/modules/auth/AuthProvider.test.tsx`
- `src/modules/auth/guards.test.tsx`

Run them with:

```bash
npm run test
```
