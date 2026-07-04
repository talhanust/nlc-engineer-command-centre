# Contributing — NLC Engineer Command Centre

## Ground rules

1. **This is a port, not a redesign.** The single-file prototype in `prototype/` and its 44 smoke suites define correct behavior. Match it; don't reinvent it.
2. **One feature area per pull request.** Small, reviewable, independently shippable — the same discipline that built the prototype.
3. **Zero regressions.** Every PR keeps `main` green: web typecheck, web tests, both-mode builds, server typecheck, and the prototype parity job must all pass.
4. **Branding:** the app's global identity is the **NLC Engineer Command Centre**. Client names (FGEHA, CDA, NHA, …) appear only as a *project's client* — never as page branding. There is a test enforcing this; don't weaken it.
5. **No secrets or real data in the repo.** Demo JSON under `prototype/demo-data/` is the only data that belongs here.

## Local setup

```bash
npm ci
npm run dev          # web, local mode, http://localhost:5173
npm run typecheck
npm test
```

Full stack (web + api + postgres): `cp .env.example .env && docker compose up --build`.

## Definition of done for a feature PR

- The feature matches the prototype's behavior (link the relevant prototype screen in the PR).
- Unit/component tests cover the logic; where the prototype has a smoke suite for it, the React tests reproduce those assertions.
- `npm run typecheck`, `npm test`, and both builds pass locally.
- No client name used as global branding.
- Strings are externalized (i18n-ready); colors come from the theme tokens, not hardcoded hex.
- Accessibility: keyboard reachable, labelled controls, AA contrast.

## Branch / commit conventions

- Branch: `feat/<area>-<short>`, `fix/<short>`, `chore/<short>`.
- Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- PRs target `main`; CI must be green; one approving review.

## Where things live

See `README.md` for the layout. The build brief for the whole port is `docs/REACT_PORT_BUILD_PROMPT.md`; the API surface is `docs/API_Contract.md`; the data model is `db/schema.sql`.
