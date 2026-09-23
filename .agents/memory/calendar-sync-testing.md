---
name: Isolated calendar sync checks
description: Why pure calendar calculations should be checked separately from the app's connected database and connector runtime
---

Keep timezone and event-payload checks in a pure module that can be bundled without the application runtime.

**Why:** Standalone Node checks of a server module that imports the workspace database and connector SDK can fail on package resolution before reaching the behavior under test. Those failures are not evidence that the deployed server is broken.

**How to apply:** For future calendar calculation or payload changes, test the pure functions separately. Verify connector access through the actual server environment, and use the managed workflow for server startup checks.