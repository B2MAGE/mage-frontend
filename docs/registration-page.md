# Registration Page

## Overview

The registration page creates a local MAGE account through the backend auth API. It performs lightweight client-side validation, submits the registration payload, and then forwards the user to the login page instead of creating a logged-in session automatically.

Route:

- `/register`

Access:

- guest-only
- authenticated users are redirected away through the shared route guard

## Related Files

- `src/pages/RegisterPage.tsx`
- `src/lib/api.ts`
- `src/lib/authForm.ts`
- `src/pages/RegisterPage.test.tsx`

## Request Flow

Primary request:

- `POST /api/auth/register`

Expected request body:

```json
{
  "displayName": "Example User",
  "email": "user@example.com",
  "password": "example-password"
}
```

Requests are built through `buildApiUrl()`. For local development, leave `VITE_API_BASE_URL` unset and use the Vite `/api` proxy described in the repository README.

## User-Facing Behavior

- validates display name, email, and password before submission
- requires a minimum display-name length of `2`
- requires a minimum password length of `8`
- disables the submit button while the request is in flight
- surfaces backend validation details when present
- surfaces conflict responses such as duplicate-email registration
- redirects to `/login` on success
- passes the registered email and a success notice into login page state

## Current Scope

The registration page currently supports:

- local account creation
- client-side validation
- backend error handling
- post-registration redirect into login

It does not currently:

- create an authenticated session on success
- support OAuth-based sign-up directly from this page

## Tests

Main coverage lives in:

- `src/pages/RegisterPage.test.tsx`

Run it with:

```bash
npm run test
```
