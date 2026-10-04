---
name: Calendar event identity across environments
description: Why Google Calendar event identity must distinguish development and published appointment databases
---

Development and published databases may assign the same numeric appointment IDs to different bookings while using the same connected Google Calendar account. Keep new published event IDs in a separate namespace from legacy development event IDs, and preserve stored IDs for existing synced events.

**Why:** This project had overlapping upcoming appointment IDs across development and production. Reusing the same Google event ID would make a catch-up or status update overwrite an unrelated event instead of creating a new one.

**How to apply:** When changing event ID generation, migration, or reconciliation, check cross-environment collisions as well as idempotency within one environment. Never rewrite existing stored event IDs without a safe migration.

Calendar cutover must establish one active production writer for migrated event
links, not merely add a new namespace for new bookings.

**Why:** Cloning the published database preserves links to the same Google
events. Advisory locks in separate databases cannot coordinate those writers,
and distinct IDs for new bookings do not isolate copied existing links.

**How to apply:** Before authorizing or enabling a second hosting environment,
plan ownership of migrated events and keep its automatic sync disabled until
that plan is approved. Preserve stored event IDs and distinguish future
booking namespaces across hosting environments as well as development.

A disable variable is not a cutover safeguard until the running build implements
it and has loaded it. Verify the actual deployed writer, not just configuration.

**Why:** Calendar gates were prepared after both hosts already had older builds
with unconditional boot/timer reconciliation. Saving new variables without
deploying cannot retrofit that behavior.

**How to apply:** Deploy and verify the guarded build before authorizing another
writer. For the former producer, verify disabled status or use an approved stop
method; do not revoke a shared connector that also supports development.