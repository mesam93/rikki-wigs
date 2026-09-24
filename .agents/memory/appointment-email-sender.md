---
name: Appointment email sender choice
description: Why the appointment sender uses a connected mailbox rather than Resend for a consumer email address.
---

The owner chose to send appointment confirmations from their existing consumer mailbox, so the app uses that mailbox's authorized sending integration instead of Resend.

**Why:** Resend requires verification of a domain the owner controls; a third-party consumer email domain cannot be verified by the owner. A connected mailbox can send from its own authenticated address without a custom domain.

**How to apply:** If changing email providers later, ask whether the owner has a domain they control and can verify. Do not assume that connecting a transactional provider makes a consumer mailbox address valid as its sender.

The owner confirmed on 2026-09-24 that a new-appointment alert sent to the same connected Gmail mailbox arrived in their inbox on the published app.

**Why:** Self-addressed Gmail alerts had only been verified by code and connection checks before this real receipt.

**How to apply:** The owner alert can be treated as proven for that mailbox, but its success does not establish that separate customer-addressed emails arrive.