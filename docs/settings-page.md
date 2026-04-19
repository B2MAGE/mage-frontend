# Settings Page

## Overview

The settings page shows the authenticated user's profile details and allows them to save updated
`firstName`, `lastName`, and `displayName` values through the backend profile endpoint. The
frontend keeps the email field read-only and refreshes the shared auth session after a successful
save so updated name values remain available across the app.

Route:

- `/settings`

Access:

- authenticated-only through the shared route guard

## Related Files

- `src/pages/SettingsPage.tsx`
- `src/pages/SettingsPage.test.tsx`
- `src/auth/AuthContext.tsx`
- `src/auth/AuthContext.test.tsx`
- `src/lib/authForm.ts`

## Request Flow

Primary request:

- `PUT /api/users/me`

Expected request body:

```json
{
  "firstName": "Scene",
  "lastName": "Artist",
  "displayName": "Scene Artist"
}
```

Requests are sent through `authenticatedFetch()`, which applies the bearer token and clears the
stored session automatically if the backend returns `401`.

## User-Facing Behavior

- initializes the form from persisted `firstName`, `lastName`, and `displayName` values
- keeps the email field read-only
- disables the save button until a name field changes
- shows a loading state while the save request is in flight
- surfaces backend field validation details when present
- shows a generic unavailable message when the save request fails
- updates the shared auth session through `updateAuthenticatedUser()` after a successful save
- keeps `displayName` as the public-facing name used on scenes, comments, and other attribution surfaces

## Auth Session Notes

Successful saves update the in-memory auth state and the stored `mage.auth.session` snapshot. That
lets a subsequent app reload restore the saved profile values without waiting for another manual
edit.

## Tests

Main coverage lives in:

- `src/pages/SettingsPage.test.tsx`
- `src/auth/AuthContext.test.tsx`

Run them with:

```bash
npm run test
```
