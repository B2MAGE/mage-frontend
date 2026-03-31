# Registration Page

The registration page is available at `/register`.

## Purpose

This page is the first implemented account-management flow in the frontend. It collects local-account credentials, validates them on the client, and submits them to the backend registration endpoint.

## API contract

- Method: `POST`
- Endpoint: `/auth/register`
- Content type: `application/json`

Request body:

```json
{
  "displayName": "Example User",
  "email": "user@example.com",
  "password": "example-password"
}
```

The page reads `VITE_API_BASE_URL` at runtime. When the variable is set, requests are sent to `${VITE_API_BASE_URL}/auth/register`. When it is not set, the page uses same-origin `/auth/register`.

For normal localhost development, the Vite dev server proxies same-origin `/auth/register` requests to `http://localhost:8080`.

## UI behavior

- Requires display name, email, and password before submission
- Validates email format and minimum lengths on the client
- Disables the submit button while the request is in flight
- Shows a success state after a successful registration
- Shows backend validation errors from `details`
- Shows conflict or generic form errors when registration fails

## Test coverage

`src/pages/RegisterPage.test.tsx` covers:

- client-side validation without network submission
- successful submission, including loading and success states
- request payload trimming and endpoint usage
- conflict error handling from the backend

Run the tests with:

```bash
npm run test
```
