---
name: Exact-minute booking availability
description: Why exact-minute appointment starts use compact ranges alongside suggested times
---

Allow booking starts and service durations in single-minute increments, but don't render or transmit a separate button for every minute across the booking horizon. Keep a compact representation of valid starts for precise client-side checks and a small list of suggested times for quick selection.

**Why:** The owner asked for arbitrary-minute appointment times and durations. Sending minute-by-minute slots across months of dates would make the booking interface and availability payload unnecessarily large.

**How to apply:** When changing availability generation or booking UI, preserve exact-minute validity (including narrow off-grid openings) and server-side overlap checks; suggestions should never be the only way to select an available time.