---
name: Bundled ExcelJS runtime dependency
description: A runtime-only package requirement when the API server bundles ExcelJS.
---

When adding ExcelJS to the API server, keep its SWC helper package as a direct runtime dependency if the bundle leaves helper imports external.

**Why:** Typechecking and bundling succeeded, but the managed API workflow crashed at startup with a missing SWC helper import. The dependency had not been installed in the API package even though bundling generated an external import.

**How to apply:** For future ExcelJS upgrades or backend bundle changes, verify the managed workflow actually starts after building; do not rely on a successful build alone.