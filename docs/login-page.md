# Login Page

The login page is available at `/login`.

## Purpose

This page handles the local email-and-password sign-in flow in the frontend. It validates credentials on the client, submits them to the backend login endpoint, persists the returned access token, and restores the signed-in user through the shared auth session.

## API contract

- Method: `POST`
- Endpoint: `/api/auth/login`
- Content type: `application/json`

Request body:

```json
{
  "email": "user@example.com",
  "password": "example-password"
}
```

The page reads `VITE_API_BASE_URL` at runtime. When the variable is set, requests are sent to `${VITE_API_BASE_URL}/api/auth/login`. When it is not set, the page uses same-origin `/api/auth/login`.

When a stored access token exists, the frontend bootstraps auth state by calling `${VITE_API_BASE_URL}/api/users/me` or same-origin `/api/users/me`.

For normal localhost development, the Vite dev server proxies same-origin `/api` requests to `http://localhost:8080`.

## UI behavior

- Requires email and password before submission
- Validates email format on the client
- Disables the submit button while the request is in flight
- Stores the returned `accessToken` in browser storage after a successful login response
- Restores the authenticated user on refresh through `GET /api/users/me`
- Shows backend validation errors from `details`
- Shows invalid-credential or generic form errors when login fails
- Clears invalid or expired stored tokens automatically
- Shows logout in the shared app header when the user is signed in

## Shared auth session

The shared frontend auth provider currently:

- persists the login `accessToken` in browser storage
- boots auth state on app load
- calls `GET /api/users/me` when a stored token exists
- clears the stored token if the backend responds with `401`
- provides a shared authenticated request helper that sends `Authorization: Bearer <accessToken>`
- exposes logout that clears the stored token and shared auth state

## Test coverage

`src/pages/LoginPage.test.tsx` covers:

- client-side validation without network submission
- successful submission, including loading, auth-session storage, and success states
- request payload trimming and endpoint usage
- invalid-credential error handling from the backend
- backend validation-detail handling for the form fields

`src/auth/AuthContext.test.tsx` covers:

- `GET /api/users/me` during app bootstrap when a stored token exists
- restoring the authenticated user from a valid stored session
- clearing invalid stored tokens on `401`
- logout clearing shared auth state and browser storage
- authenticated requests sending the bearer token and clearing auth state on `401`

Run the tests with:

```bash
npm run test
```
