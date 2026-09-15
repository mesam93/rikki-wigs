# Rikki Wigs

A customer-facing wig service website with appointment booking and an owner appointment-management view.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/rikki-wigs` — customer site and appointment management UI
- `artifacts/api-server/src/routes/appointments.ts` — appointment API
- `lib/api-spec/openapi.yaml` — API contract
- `lib/db/src/schema/appointments.ts` — appointment persistence

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

- Introduces Rikki Wigs and its services.
- Lets customers request available appointment dates and times.
- Lets the business review, confirm, complete, cancel, and remove appointments.

## User preferences

- Instagram is the intended visual reference; exact styling should be refined from user-provided screenshots or owned media because Instagram blocks automated profile access.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
