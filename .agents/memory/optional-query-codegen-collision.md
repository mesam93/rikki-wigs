---
name: Optional query codegen collision
description: An OpenAPI optional query parameter may create duplicate generated exports
---

Adding an optional query parameter to an existing binary-response endpoint can cause generated Zod and TypeScript barrels to export the same `*Params` name, failing library typechecking even when OpenAPI generation itself succeeds.

**Why:** A receipt inline-view query parameter triggered an ambiguous generated export; a distinct view endpoint avoided the collision and kept the two actions explicit.

**How to apply:** When adding optional query params, run codegen and inspect duplicate-export errors. For distinct actions such as view versus download, prefer separate contract-defined endpoints rather than manually editing generated files.