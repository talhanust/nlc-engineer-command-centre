---
name: Feature parity
about: Port a prototype feature area to the React app
title: "[parity] <feature area>"
labels: [parity]
---

**Prototype reference**
Which screen/tab in `prototype/` does this cover? (e.g. Commercial → IPC register)

**Scope**
The specific behaviors to reproduce (list the user-visible actions and computed outputs).

**Data**
Which `DataProvider` methods / API endpoints (see `docs/API_Contract.md`) and which `db/schema.sql` tables are involved.

**Acceptance**
- [ ] Behavior matches the prototype
- [ ] Tests reproduce the prototype's assertions for this area
- [ ] Works in both `local` and `api` modes
- [ ] Accessible + themed + i18n-ready
