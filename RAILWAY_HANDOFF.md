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