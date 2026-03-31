# Login Page

The login page is available at `/login`.

## Purpose

This page handles the local email-and-password sign-in flow in the frontend. It validates credentials on the client, submits them to the backend login endpoint, and reflects backend success or failure in the UI.

## API contract

- Method: `POST`
- Endpoint: `/auth/login`
- Content type: `application/json`

Request body:

```json
{
  "email": "user@example.com",
  "password": "example-password"
}
```

The page reads `VITE_API_BASE_URL` at runtime. When the variable is set, requests are sent to `${VITE_API_BASE_URL}/auth/login`. When it is not set, the page uses same-origin `/auth/login`.

## UI behavior

- Requires email and password before submission
- Validates email format on the client
- Disables the submit button while the request is in flight
- Shows a success state after a successful login response
- Shows backend validation errors from `details`
- Shows invalid-credential or generic form errors when login fails

## Current limitation

The backend returns an `accessToken` for a successful login response, but the frontend does not persist that token yet. Protected session state and post-login navigation still need a follow-up implementation step.

## Test coverage

`src/pages/LoginPage.test.tsx` covers:

- client-side validation without network submission
- successful submission, including loading and success states
- request payload trimming and endpoint usage
- invalid-credential error handling from the backend
- backend validation-detail handling for the form fields

Run the tests with:

```bash
npm run test
```
