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

**Caution:** The API starts calendar reconciliation on boot when enabled. Do not run
a second copy against a live database/calendar just to test static serving.
Use the isolated `test:frontend` checks for routing verification.

## Step 2 — published database records copied

On October 1, 2026, the owner selected the **published Replit database** as the
source. Its snapshot was taken at 10:18:48 UTC and copied into Railway:

| Records | Count |
| --- | ---: |
| Wig orders | 186 |
| Appointments | 10 |
| Issued receipts | 3 |
| Clients | 2 |
| Services | 5 |
| Gallery records | 2 |
| Testimonials | 2 |
| Appointment email notification history | 14 |
| Calendar sync records | 7 |
| Scheduling settings / calendar settings | 0 / 0 |

All rows were compared with the source before commit and independently checked
again after commit. IDs, receipt snapshots, JSON values, timestamp precision,
and date strings were preserved. Six serial sequences were reset transactionally
to the next unused ID. Receipt and email references were checked. Neither Replit
database was changed.

### Backup and transfer safety

- Railway's previous default-only records are retained in schema
  `handoff_backup_20261001102119779`.
- Its `transfer_manifest` records the source snapshot time, row fingerprints,
  previous counts, and previous sequence states.
- This is a backup of **the pre-transfer defaults**, not a backup of subsequently
  created Railway customer records. Restoring it over current data would remove
  the copied records and any newer changes; obtain explicit approval first.
- The temporary PostgreSQL TCP proxy was removed and its absence verified.
- Private local exports were removed after verification. No customer export or
  database credential was committed to the repository.
- The transfer-only Replit secret is not an application dependency. Remove it
  when no longer needed. A database password posted in chat should be rotated;
  changing only a Railway variable does not necessarily change an initialized
  PostgreSQL role's password.

The standalone utility is `scripts/src/transfer-railway-data.mjs`. It requires a
version-2 published snapshot, an inspected destination baseline, the secure
transfer-only connection secret, and an explicit temporary Railway endpoint.
It defaults to a dry run. `--apply` creates the destination backup and replaces
only a destination that still contains the expected defaults. It refuses a
populated destination and is **not** a recurring sync or deployment command.
Its support tests run with:

```text
node --test scripts/src/railway-transfer-support.test.mjs
```

### Remaining boundaries

This is a point-in-time database copy; later Replit changes are not automatically
copied to Railway. Image database references were retained, but uploaded image
bytes remain a separate storage migration. Google Calendar, appointment email,
and live Clerk configuration are also separate hosting/handoff steps. The
Railway homepage, health endpoint, and public services endpoint were checked
after the database transfer.

## Step 3 — Railway database password rotated

On October 4, 2026, the PostgreSQL role password was changed through a temporary
private Railway Function. This changed the initialized database's actual
password, not just its service variables.

- A new authenticated connection succeeded and the old password was rejected.
- Encrypted connections and SCRAM password storage were verified.
- Row fingerprints for all 11 application tables remained unchanged through
  rotation and final verification, including all 186 orders, 10 appointments,
  and 3 issued receipts.
- Postgres `POSTGRES_PASSWORD` and `PGPASSWORD` now reference its
  `ROTATION_NEW_PASSWORD` variable. Its private `DATABASE_URL` uses those
  connection variables, and the app references `Postgres.DATABASE_URL`.
- The existing app was redeployed. The public homepage, health endpoint, and
  database-backed services endpoint passed after the new deployment succeeded.
- The temporary Function was deleted. The database still has no public TCP
  proxy. Neither Replit database nor the Replit development services were changed.

**Keep the active password variable:** despite its name,
`ROTATION_NEW_PASSWORD` is now an active Railway credential dependency. Do not
delete it or replace its value as cleanup. For another rotation, use a separately
named candidate secret while the current connection continues to use the active
one; coordinate the actual role change and consumer references again.

The transfer-only Replit secret was not deleted by this step. Uploaded image
bytes, authentication migration, connected-service handoff, and ownership
transfer remain outside this password rotation.

## Step 4 — uploaded images in private Railway storage

The October 4, 2026 image migration copies every uploaded image referenced by
Railway's records: two gallery photos and one service photo, totaling 7,390,491
bytes. The source is the published Replit site's corresponding image endpoints,
with each record ID and stored object path checked against Railway before copying.
The other four service images are bundled website assets, not uploaded objects.

Each copied file's SHA-256 and image content type are verified by reading it back
from the private `rikki-images` Railway bucket. Existing `/objects/gallery/...`
and `/objects/services/...` references and `/api/.../images/:id` URLs remain
unchanged. No source files or database rows are changed. Fingerprints for all
11 application tables are compared before and after copying.

### Storage configuration

The Railway app selects `OBJECT_STORAGE_BACKEND=s3`. Its configuration uses
Railway references, not copied credential values:

| App variable | Railway reference / setting |
| --- | --- |
| `S3_ENDPOINT` | `${{rikki-images.ENDPOINT}}` |
| `S3_BUCKET` | `${{rikki-images.BUCKET}}` |
| `S3_REGION` | `${{rikki-images.REGION}}` |
| `S3_ACCESS_KEY_ID` | `${{rikki-images.ACCESS_KEY_ID}}` |
| `S3_SECRET_ACCESS_KEY` | `${{rikki-images.SECRET_ACCESS_KEY}}` |
| `S3_FORCE_PATH_STYLE` | `false` — virtual-host addressing |

Replit keeps its existing object storage and sidecar authentication. With no
`OBJECT_STORAGE_BACKEND` override, development continues using Replit storage.
Do not copy Railway's S3 configuration into Replit unless deliberately changing
that arrangement. This is a point-in-time copy, not ongoing synchronization
between the two hosts.

The bucket remains private. Image reads go through the existing API routes;
upload URL requests retain the existing owner/admin protection. Browser uploads
use 15-minute signed PUT URLs with the exact requested image content type.
Automatic empty-body checksums are disabled for presigning, since the browser
supplies the actual image later.

### Browser uploads and verification

The bucket CORS rules allow direct PUT uploads from
`https://rikki-wigs-production.up.railway.app`, with the `content-type` header.
**When adding a custom website domain, add its exact HTTPS origin to these bucket
CORS rules as well.** Otherwise public image reads may work while owner uploads
fail in the browser. Preserve any other legitimate CORS rules.

The private, one-time Railway Function in `scripts/src/railway-image-helper.mjs`
supports inspection and an explicitly selected apply operation. It refuses
unmatched or unavailable source images and conflicting destination bytes.
Its database session is read-only. It checks a temporary, unreferenced image's
signed upload, browser CORS, readback, private access, and deletion. It never
logs credentials or signed URLs and does not expose an HTTP listener.
Remove the temporary Function after its verified success; retain the bucket.
The helper is not part of normal deployment or recurring synchronization.

Adapter regression checks:

```text
pnpm --filter @workspace/api-server run test:storage
```

Authentication migration, appointment email/Google Calendar handoff, custom
domains, and ownership transfer remain separate steps.

## Step 5 — authentication handoff (not complete)

### Independent access checks

Read-only Railway checks confirmed that unsigned requests to the admin session,
orders, appointments, services, gallery, testimonials, scheduling, calendar
status, client history, and receipt endpoints return 401. A forged session cookie
combined with a supplied email was also rejected. The public homepage, sign-in,
sign-up, and health routes remain available.

Code inspection confirms that client ownership comes from the authenticated
user's verified primary email, not a supplied email or client ID. Appointments
are scoped to that email, and receipt access uses the email in the issued receipt
snapshot. These are code-level checks, not completed signed-in browser tests.

**Owner-email configuration:** The owner added and applied `ADMIN_EMAIL` directly
in Railway. Its presence in the app's variables was confirmed without reading or
displaying the value. The previous missing-setting blocker is resolved at the
configuration level; the email's correctness and authenticated owner access
still require the signed-in checks below.

The deployment applying this setting succeeded. The new server's health check
passed, and unsigned admin-session requests remained blocked with 401.

- [x] Set `ADMIN_EMAIL` directly in Railway's app variables to the owner's Google
  account email, without sharing it in chat or committing it.
- [ ] After Railway deploys the setting, verify owner authorization and ordinary
  client rejection through the real sign-in flow.

No access policy, authentication credentials, or customer records were changed
by this audit.

### Deferred: RIKKI WIGS branding on Google sign-in

The owner approved deferring this configuration until access to the Auth settings
is available. An existing Google sign-in app is available; do not create another
by default.

- [ ] Confirm Google app branding is **RIKKI WIGS**.
- [ ] Configure custom Google credentials in **Auth → Configure → SSO providers
  → Production → Google**. Enter credentials directly in provider settings,
  never in chat or Git.
- [ ] Add the provider checklist's exact callback URLs and origins to the existing
  Google OAuth client without removing existing authorized URLs.
- [ ] Verify Railway uses the intended production authentication configuration.
- [ ] Verify the actual Google account-selection/consent window shows RIKKI WIGS
  for both admins and clients, and verify their respective access after sign-in.

Independent Railway configuration checks can continue while this is pending.
Do not declare authentication complete or the Railway handoff ready for final
cutover until these checks pass. Preserve Replit development, existing accounts,
and the shared Google sign-in flow with server-side owner authorization.

## Step 6 — appointment email handoff (not complete)

Read-only inspection found no email delivery or SMTP settings in the Railway
app or its shared environment variables. Without `EMAIL_DELIVERY_MODE`, the
current app disables email delivery. All seven email rendering and notification
logic tests passed; this does not establish live delivery. No test messages were
sent and no appointments or notification records were created by the audit.

The existing Gmail transport uses Replit Connectors and its Replit runtime
authentication. Enabling Gmail mode alone on the current Railway service does
not provide that authentication. Preserve the owner's existing Gmail sender
unless they approve a change; a connected Resend account does not establish a
verified sender domain.

Prepared with the owner's approval: a direct Gmail API transport for Railway,
while retaining Replit's existing connector transport as the default. All 18
email tests and the API server type check passed. HTTP requests in these tests
use injected fake clients and credentials; they do not prove live Gmail
authorization or delivery. No real emails or database writes were performed.

The prepared support deployed successfully to Railway. Runtime startup was
clean, `/api/healthz` returned 200, and anonymous `/api/email-status` access
remained blocked with 401. No email settings or mailbox credentials were added;
Railway still defaults to disabled delivery. The public development homepage
also loaded cleanly after the server restart.

The transport refreshes and briefly caches Google access tokens, shares
concurrent refreshes, reports revoked authorization without exposing secrets,
and never retries ambiguous message sends. No new dependencies were needed.
The notification scope is unchanged: request receipts, confirmations, and owner
booking alerts. Cancellation, rescheduling, and completion emails remain off
in Gmail mode.

### Pending secure authorization and activation

Keep Railway `EMAIL_DELIVERY_MODE` absent or explicitly `disabled` until the
owner approves authorization and an isolated delivery test. Do not copy
Replit identity tokens or extract credentials from the connected integration.
Replit's environment settings do not need to change.

The following settings belong only in Railway's app variables:

| Setting | Purpose |
| --- | --- |
| `GMAIL_TRANSPORT=direct` | Select the prepared direct Gmail API transport. |
| `GMAIL_CLIENT_ID` | Owner-controlled Google OAuth client for mailbox authorization. |
| `GMAIL_CLIENT_SECRET` | Private OAuth client credential; enter directly in Railway, never chat or Git. |
| `GMAIL_REFRESH_TOKEN` | Offline authorization for the existing sender mailbox; enter directly in Railway, never chat or Git. |
| `EMAIL_FROM` | The same existing authorized Gmail sender, optionally with the Rikki Wigs display name. |
| `EMAIL_REPLY_TO` | Optional reply-to address; preserve the intended existing address. |
| `EMAIL_TIMEZONE=America/New_York` | Preserve appointment email dates in the business timezone. |
| `EMAIL_DELIVERY_MODE=gmail` | Activation switch, only after approval to send and test. |

Authorize only the owner's sender mailbox with the Gmail sending permission
(`https://www.googleapis.com/auth/gmail.send`) and offline access. This is not
customer sign-in: do not add Gmail permissions to Clerk or customer Google
login. Preserve existing Google OAuth clients and callback URLs. Check Google's
current consent/publishing rules and refresh-token lifetime before cutover;
a temporary testing grant is not a verified durable production connection.

- [x] Prepare direct Gmail support while preserving Replit delivery behavior.
- [x] Verify disabled mode, notification scope, token refresh, concurrency,
  sanitized failures, and no send retries using mocked requests.
- [ ] Authorize the existing sender mailbox and add credentials securely.
- [ ] With explicit approval, verify an isolated email to an approved recipient,
  including its sender address, then verify customer receipts and owner alerts.
- [ ] Confirm the protected email-status page and real delivery after activation.

The admin status reports configuration presence, not proof that Google has
accepted the credentials. Never claim delivery works from that status alone.
Do not automatically replay historical or disabled notification records when
enabling sending.

Railway documentation restricts outbound SMTP to Pro plans and above. Do not
assume Gmail SMTP is available on the current plan or require a plan change
without the owner's approval. The Google sign-in branding configuration and
Google Calendar handoff remain separate from mailbox authorization.

## Step 7 — Google Calendar handoff (not complete)

The initial owner-approved audit was read-only. No app code or settings were
changed by that audit, no server was restarted, and no calendar event was created,
updated, or deleted. It used metadata inspection, existing runtime logs, public health
and anonymous access checks, pure tests, and a read-only calendar-list request.

### Initial audit findings, before preparation

- The existing Replit Calendar connection answered successfully and has one
  writable primary calendar. This verifies the Replit connection, not Railway
  authorization or the current Railway-selected calendar.
- Railway still uses the Replit Connectors Calendar transport. Its app and
  shared configuration have no Replit connector runtime identity settings.
  There is no prepared direct Calendar transport equivalent to the new Gmail
  adapter. Railway calendar authorization and real sync remain unverified.
- Calendar reconciliation runs automatically on boot and every minute; there
  is currently no explicit calendar delivery-off switch. Adding a working
  calendar connection could immediately start processing stored appointments.
- Event creation, updates/rescheduling, cancellation and deleted-appointment
  removal are supported in the code. New historical appointments are excluded;
  already linked events retain their stored IDs and may still be updated.
- Fixed event IDs and PostgreSQL advisory locks protect retries and workers
  sharing one database. They do not coordinate separate Replit and Railway
  databases against the same Google Calendar.
- The migration preserved seven calendar sync records and their Google event
  links. Both production copies could therefore modify the same existing
  events if both are enabled. Changing only future event ID generation would
  not isolate these copied links.
- New IDs currently distinguish only development from published Replit via
  `REPLIT_DEPLOYMENT`. That setting is absent from Railway's configured
  variables, and the Railway start command does not set it. Railway would use
  the development ID namespace for newly linked appointments. Simply setting
  the marker to published would instead reuse Replit production's namespace;
  independent new bookings could collide there too.
- All three pure calendar tests passed: stable development/published IDs,
  New York daylight-saving offsets, and service duration/privacy in payloads.
  These tests do not cover a separate Railway namespace or live delivery.
- Railway health returned 200 and anonymous calendar status access returned
  401. The sampled deployment logs contained no calendar entries; absence of
  logged failures is not proof of successful syncing.

### Approved disabled preparation

The owner approved preparing Railway support while keeping its syncing disabled.
A direct Google Calendar API transport is implemented, with separate Calendar
OAuth credentials, shared refresh caching, fixed HTTPS endpoints, timeouts,
sanitized errors, and no automatic transport write retries. Replit retains its
connector transport and existing sync behavior by default.

The gate stops boot/background reconciliation, booking-triggered synchronization,
and retries before worker database access or event writes. The protected manual
retry endpoint rejects disabled syncing with 409. Read-only status/calendar
listing remains available for checking authorization without enabling writes.
The owner Schedule panel displays enabled/disabled state and connection errors;
its retry button is disabled when syncing is off or the connection is unavailable.
No customer sign-in scopes, destination settings, or stored event IDs are changed.

Fourteen Calendar tests passed, including fully mocked database/HTTP worker tests
for zero operations while disabled, recovery after an uncertain creation response,
preservation of migrated links, rescheduling, and idempotent cancellation/removal.
The eighteen email tests, workspace type checks, and combined Railway build also
passed. Development API startup, health, and unsigned Calendar rejection passed.
All worker test records and Google responses were synthetic; no live test events,
customer records, or emails were created or modified.

The real status component was checked in a browser-only harness with synthetic
responses: disabled state and the blocked retry control passed. A connected
fixture rendered correctly, but its retry mock did not intercept the request;
the real protected endpoint rejected it with 401. Live owner sign-in and
successful retry/result feedback therefore remain unverified. No authentication
bypass was added.

The following non-secret settings were saved on Railway's app service with
`skipDeploys=true`, without changing credentials or deploying:

| Setting | Purpose |
| --- | --- |
| `CALENDAR_TRANSPORT=direct` | Select the prepared independent Google API connection. |
| `CALENDAR_SYNC_ENABLED=false` | Keep event synchronization explicitly off. |
| `CALENDAR_EVENT_NAMESPACE=railway` | Give new bookings a third stable event-ID namespace. |

On October 4, 2026, the owner approved publishing these safeguards to Railway
with syncing still disabled. Release verification is pending until the new
deployment succeeds. Startup logs report only the non-secret enabled state,
transport, and event namespace so the actual running configuration can be checked.
Saving settings without deploying does not stop an older worker. Verify the
deployed guard before authorizing any Railway Calendar connection; do not
interpret saved variables alone as proof that the live build honors the switch.

Direct mode also defaults to disabled if its flag is absent; invalid flags,
transport/namespace settings, or incomplete authorization fail closed. It refuses
to reuse either Replit namespace. Existing linked IDs remain unchanged.

### Pending secure authorization and production-writer cutover

Only after deploying the guard, securely add `CALENDAR_CLIENT_ID`,
`CALENDAR_CLIENT_SECRET`, and `CALENDAR_REFRESH_TOKEN` to Railway, never chat or
Git. Authorize the owner's intended Calendar separately from Gmail and customer
Google/Clerk sign-in, with offline access and the Calendar event and calendar-list
permissions required by this adapter. Do not extract Replit connector credentials,
add Calendar scopes to customer sign-in, or reuse Gmail variables implicitly.
Verify Google's current consent/publishing rules and refresh-token lifetime.

Preserve Replit's existing connection and stored Google event IDs. Establish one
active production writer for migrated events before enabling Railway syncing:
separate database locks and distinct new IDs do not isolate copied links. Verify
the former production writer actually honors its disable switch; an older build
must be updated or stopped using an owner-approved method. Do not revoke a shared
connector merely to stop production, since that could break Replit development.
Do not replay past unlinked appointments or select another destination automatically.

- [x] Prepare direct Calendar support and an explicit disabled reconciliation gate.
- [x] Verify distinct new-booking IDs across development, Replit production,
  and Railway, while preserving existing stored event links.
- [ ] Publish the prepared safeguards to Railway with syncing disabled and verify
  the deployed build, including protected owner status.
- [ ] Confirm the intended destination and authorize the owner's Calendar
  connection securely, separate from customer sign-in.
- [ ] Approve the production-writer cutover plan before enabling automatic sync.
- [ ] With explicit approval, verify a synthetic event's creation, update,
  cancellation/removal and duplicate protection without using customer bookings.

The protected Railway status and current database selection/backlog were not
read through an authenticated owner session. Do not treat the original
migration counts as current operational counts or declare Calendar ready.