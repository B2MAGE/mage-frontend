# Registration Page

## Overview

The registration page creates a local MAGE account through the backend auth API. It performs lightweight client-side validation, submits the registration payload, and then forwards the user to the login page instead of creating a logged-in session automatically.

Route:

- `/register`

Access:

- guest-only
- authenticated users are redirected away through the shared route guard

## Related Files

- `src/modules/auth/RegisterPage.tsx`
- `src/modules/auth/client.ts`
- `src/lib/api.ts`
- `src/modules/auth/RegisterPage.test.tsx`
- `src/shared/ui/TextInputField.tsx`

## Request Flow

Primary request:

- `POST /api/auth/register`

Expected request body:

```json
{
  "firstName": "Example",
  "lastName": "User",
  "displayName": "Example User",
  "email": "user@example.com",
  "password": "example-password"
}
```

Requests are built through `buildApiUrl()`. For local development, leave `VITE_API_BASE_URL` unset and use the Vite `/api` proxy described in the repository README.

## User-Facing Behavior

- validates first name, last name, display name, email, and password before submission
- requires a minimum first-name length of `2`
- requires a minimum last-name length of `2`
- requires a minimum display-name length of `2`
- requires a minimum password length of `8`
- disables the submit button while the request is in flight
- surfaces backend validation details for first name, last name, display name, email, and password when present
- surfaces conflict responses such as duplicate-email registration
- redirects to `/login` on success
- passes the registered email and a success notice into login page state
- explains that display name is the public name shown on scenes and comments

## Current Scope

The registration page currently supports:

- local account creation
- separate first name, last name, and public display name inputs
- client-side validation
- backend error handling
- post-registration redirect into login

It does not currently:

- create an authenticated session on success
- support OAuth-based sign-up directly from this page

## Tests

Main coverage lives in:

- `src/modules/auth/RegisterPage.test.tsx`

Run it with:

```bash
npm run test
```
