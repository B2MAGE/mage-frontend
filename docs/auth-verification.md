# Authentication verification

Run the real frontend HTTP client against a running backend:

```sh
npm ci
npm run auth:verify -- http://127.0.0.1:18080
```

Use the disposable portfolio-demo backend from `mage-backend/scripts/demo/README.md`
for routine checks. To check a deployed environment intentionally, substitute its
origin (for example `https://mage.peterbucci.com`). The command creates one unique
`@example.test` account per run; it never uses an existing user's password or
prints/saves its generated password or bearer token. Clear test accounts through
the deliberate demo reset, not normal startup. Do not run it repeatedly against
production unless you intend to keep those test accounts.

The check fails unless registration succeeds, incorrect credentials are rejected,
login issues a token, the application's authenticated client retrieves that same
user and handle, and missing/invalid tokens are rejected. No requests are mocked.
Run it when changing auth, session formats, API routing or deployment configuration.

## Manual browser check

1. On the intended local or deployed site, register a new disposable account with
   a valid unique handle. Registration should lead to login.
2. Attempt login with a wrong password; confirm a useful error and no signed-in state.
3. Log in correctly. Confirm the account menu and profile link use the new handle.
4. Open My scenes and refresh. The current session should restore without another login.
5. Log out. My scenes should require sign-in, while Explore and public profiles remain readable.
6. For a failed/expired session, confirm a sign-in prompt rather than a partially authenticated UI.

The automated check covers HTTP integration; the browser checklist covers routing,
session restoration and visible feedback. Neither changes the site's design.
