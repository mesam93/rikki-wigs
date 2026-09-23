---
name: JSX generic arguments and Cartographer
description: A Vite development-source transformation limitation relevant to typed React tab components.
---

Avoid explicit generic type arguments on JSX component invocations when the Replit Cartographer development plugin is active; let props infer the type or use typed wrapper callbacks instead.

**Why:** TypeScript type-checking can pass while Cartographer's JSX source transformation fails to parse an explicit generic invocation, leaving the development preview unable to load that module.

**How to apply:** For typed React components in this project's Vite frontend, verify the managed development server after type-checking, especially when changing JSX syntax.