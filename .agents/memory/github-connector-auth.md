---
name: GitHub connector authentication
description: Keep GitHub connector authentication separate from terminal Git credentials.
---

Connecting GitHub does not necessarily update the credentials used by terminal Git commands.

**Why:** The connector successfully accessed this repository while terminal pushes continued to fail authentication.

**How to apply:** If a push fails after connecting GitHub, use the connector's authenticated API without extracting credentials. Preserve the existing commit and tree where possible, verify the remote parent, and never force-update the branch.