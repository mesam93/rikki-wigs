---
name: Unified portal admin policy
description: Why owner access shares client sign-in and has no separate password fallback
---

The owner chose the same Google-backed sign-in entry point as clients, with the admin dashboard opened only after the verified, Google-linked identity is authorized. Do not silently reinstate the old separate admin password flow as a hidden fallback.

**Why:** The owner explicitly preferred a single client-portal entry point and Google sign-in for admin. An email typed into a form is not evidence of identity, and a hidden password endpoint would preserve a second login path they chose to replace.

**How to apply:** For future login changes, keep admin authorization server-side and fail closed if identity cannot be checked. If a recovery method becomes necessary, discuss it explicitly with the owner first.