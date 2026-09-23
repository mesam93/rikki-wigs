---
name: Calendar event identity across environments
description: Why Google Calendar event identity must distinguish development and published appointment databases
---

Development and published databases may assign the same numeric appointment IDs to different bookings while using the same connected Google Calendar account. Keep new published event IDs in a separate namespace from legacy development event IDs, and preserve stored IDs for existing synced events.

**Why:** This project had overlapping upcoming appointment IDs across development and production. Reusing the same Google event ID would make a catch-up or status update overwrite an unrelated event instead of creating a new one.

**How to apply:** When changing event ID generation, migration, or reconciliation, check cross-environment collisions as well as idempotency within one environment. Never rewrite existing stored event IDs without a safe migration.