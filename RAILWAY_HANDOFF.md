# Railway handoff

## Step 1 — website and API in one service

Keep the Railway service's repository root at `/`. Use:

```text
Custom Build Command: pnpm run build:railway
Custom Start Command: pnpm run start:railway
Healthcheck Path: /api/healthz
```

The build makes the website with `BASE_PATH=/`, builds the API, and copies the
website into `artifacts/api-server/dist/public`. The start command sets production
mode and opts into frontend serving. One Node process serves the website,
`/api`, and the existing `/api/__clerk` proxy on the same domain and `PORT`.
Frontend route refreshes return `index.html`; missing API routes and assets do not.

Do not use the old API-only build command for this combined deployment.

### Configuration

- Railway must use the committed `packageManager` pin (`pnpm@10.26.1`).
- Use Node.js 24, matching the development runtime.
- Retain build dependencies during installation; Vite and esbuild are needed.
- The frontend requires `VITE_CLERK_PUBLISHABLE_KEY` at **build time**.
  If a Clerk proxy URL is configured, its `VITE_CLERK_PROXY_URL` value is also
  embedded at build time and must be appropriate for the production domain.
- The API still requires its runtime configuration, including `PORT`,
  `DATABASE_URL`, `SESSION_SECRET`, and the applicable Clerk configuration.
  Do not copy development secrets blindly or put secret values in Git.
- The Node process listens on Railway's `PORT`. A fixed domain target port must
  match it if explicitly configured.

Replit's existing separate frontend/API workflows are unchanged. They do not set
`SERVE_FRONTEND=true`, so normal development does not use the packaged frontend.

### Verification before declaring Railway live

1. The home page and a direct `/client` URL load.
2. Built JavaScript, styles, and bundled brand images return successfully.
3. `/api/healthz` returns JSON and unknown `/api` paths return 404, not the website.
4. Verify Railway logs and the deployed domain. Local checks alone do not
   establish that Railway is configured correctly.

This step does not migrate storage or authentication, configure email/calendar,
alter the database, or transfer account ownership. Uploaded images and connected
services remain separate handoff steps.

**Caution:** The existing API starts calendar reconciliation on boot. Do not run
a second copy against a live database/calendar just to test static serving.
Use the isolated `test:frontend` checks for routing verification.