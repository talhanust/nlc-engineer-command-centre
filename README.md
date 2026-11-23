# NLC Engineer Command Centre

Construction & financial **project-control platform** for the **National Logistic Corporation** — managing the org hierarchy (HQ NLC → HQ Engineers → 5 PD HQs → projects) and, per project, the BOQ, baselines, IPC/RAR commercial registers, financials, execution progress, BOQ↔WBS/material mapping, procurement with approval chains, command roll-up dashboards, exports, comments, and role-based access.

> **Branding note.** This platform belongs to **NLC**; its global identity is the *NLC Engineer Command Centre*. Client organizations such as **FGEHA, CDA, NHA, SIDC** appear only as the *client of a specific project* — never as the application's brand.

This repository is the React port of the proven single-file prototype. The behavioral source of truth is `prototype/` plus its smoke-test suites; the data model is `db/schema.sql`; the server interface is `docs/API_Contract.md`. See `docs/REACT_PORT_BUILD_PROMPT.md` for the full build brief.

## Two ways the same app runs

The app reads/writes through one `DataProvider` interface with two implementations, chosen by `VITE_DATA_MODE`:

| Mode | Provider | Data | Where it deploys |
|------|----------|------|------------------|
| `local` | `LocalDataProvider` | browser `localStorage` (seeded from demo JSON) | **GitHub Pages** static demo (single-user) |
| `api` | `ApiDataProvider` | central **PostgreSQL** via the on-prem backend | **organization on-prem** infrastructure |

**Why the split:** GitHub Pages serves static files only — no Node, no database — so the backend cannot run there, and live NLC data must stay on-prem for data residency. GitHub is therefore used for **source, CI, and the static demo**; the real multi-user system runs on NLC infrastructure.

## Layout

```
apps/web/     React + TypeScript (Vite) front end
server/       Node/Express/TypeScript reference backend (api mode)
db/           schema.sql + migrations + backup-JSON importer
docs/         architecture, API contract, build prompt
prototype/    the single-file v1.43.0 app (reference + local-demo seed)
.github/      ci.yml (build/test + postgres) and pages.yml (demo deploy)
```

## Develop

```bash
npm ci
npm run dev            # web in local mode at http://localhost:5173
npm run typecheck
npm test
```

Full stack locally (web + api + postgres):

```bash
cp .env.example .env
docker compose up --build      # web :8080, api :3000, db :5432
```

## Deploy

- **Demo → GitHub Pages:** push to `main`; `pages.yml` builds `local` mode and publishes `apps/web/dist`. Single-user, not for real data.
- **Production → on-prem:** build `apps/web` with `VITE_DATA_MODE=api` and serve the static bundle from NLC's web tier; run `server/` + PostgreSQL inside the network behind AD/SSO. Never host real data on public GitHub.

## Guardrails

- No secrets or real data in the repo (demo JSON under `db/` is fine).
- Don't use a client name (FGEHA, etc.) as global branding.
- The prototype + its 44 smoke suites define correct behavior — keep feature parity, test every increment.
