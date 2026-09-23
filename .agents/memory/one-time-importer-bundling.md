---
name: One-time importer bundling
description: Why standalone import scripts need a full bundle in this pnpm workspace
---

For one-time TypeScript importers, use a full Node bundle rather than executing the source directly or externalizing all packages.

**Why:** The workspace package entry resolves TypeScript directory imports that Node cannot execute directly; externalizing the workspace package or its PostgreSQL dependency fails from the artifact runtime path even when the API server itself builds correctly.

**How to apply:** When adding a standalone data script that uses workspace packages, verify its executable bundle in development before relying on it for an operation.