---
name: Clerk CAPTCHA in browser tests
description: How to interpret an automated test blocked by Clerk's human-verification challenge.
---

An automated browser stopping at Clerk's Cloudflare human-verification challenge is inconclusive about whether real users can finish sign-up. Never disable bot protection just to make such a test pass.

**Why:** A development browser test reached the email-first sign-up UI but could not complete the anti-bot challenge, so subsequent verification and password steps were untested.

**How to apply:** Report coverage as blocked at CAPTCHA, use code and API checks for independent behavior, and confirm the remaining journey in a normal browser when possible.