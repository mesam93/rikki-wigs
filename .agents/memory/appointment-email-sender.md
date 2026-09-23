---
name: Appointment email sender choice
description: Why the appointment sender uses a connected mailbox rather than Resend for a consumer email address.
---

The owner chose to send appointment confirmations from their existing consumer mailbox, so the app uses that mailbox's authorized sending integration instead of Resend.

**Why:** Resend requires verification of a domain the owner controls; a third-party consumer email domain cannot be verified by the owner. A connected mailbox can send from its own authenticated address without a custom domain.

**How to apply:** If changing email providers later, ask whether the owner has a domain they control and can verify. Do not assume that connecting a transactional provider makes a consumer mailbox address valid as its sender.