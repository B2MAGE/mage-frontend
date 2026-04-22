# Auth Module

This directory is the dedicated frontend-owned boundary for authentication and session behavior.

## Public API

Import route-facing auth behavior through `@modules/auth` or the stable `@auth` alias.

Exports:

- `AuthProvider`
- `useAuth()`
- `AUTH_SESSION_STORAGE_KEY`
- `ProtectedRoute`
- `GuestOnlyRoute`
- `LoginPage`
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

## Integration Rules

1. App bootstrap should mount `AuthProvider` once in app-level providers.
2. Other surfaces should consume auth state through `useAuth()` or `authenticatedFetch`, not by reading storage directly.
3. Route guards should come from this module, not from app wiring.
