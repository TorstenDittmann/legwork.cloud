# Project documentation

Start with [`HANDOFF.md`](./HANDOFF.md) when continuing this project in a new agent thread.

- [`HANDOFF.md`](./HANDOFF.md): current state, verified commands, open work, and safe continuation order.
- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md): product scope, delivery plan, and feature checklist.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md): system boundaries, data flow, tenancy, security, and operational design.
- [`ACCEPTANCE.md`](./ACCEPTANCE.md): local results and credential-gated staging acceptance criteria.

The implementation intentionally differs from the original proposal in three user-approved ways:

1. Node.js 24 is the default; Node.js 22 remains supported.
2. Turso/libSQL and a durable leased-job table replace PostgreSQL and `pg-boss`.
3. WorkOS AuthKit Organizations replace Clerk Organizations.
