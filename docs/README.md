# Project documentation

Start with [`HANDOFF.md`](./HANDOFF.md) when continuing this project in a new agent thread.

- [`HANDOFF.md`](./HANDOFF.md): current state, verified commands, open work, and safe continuation order.
- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md): product scope, delivery plan, and feature checklist.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md): system boundaries, data flow, tenancy, security, and operational design.
- [`ACCEPTANCE.md`](./ACCEPTANCE.md): local results and credential-gated staging acceptance criteria.

The implementation intentionally differs from the original proposal in four ways:

1. Bun 1.4.0 is the runtime and package manager.
2. SvelteKit replaces Next.js for `apps/web`.
3. libSQL and a durable leased-job table replace PostgreSQL and `pg-boss`.
4. WorkOS AuthKit Organizations replace Clerk Organizations.
