# BUILD PROMPT — FGEHA × NLC Unified Project Control as a complete React app, built and deployed via GitHub

> **How to use this prompt.** Paste this entire document as your first message into a fresh chat with a capable coding agent (or hand it to a developer/team). Also attach, from the existing project handoff:
> 1. `FGEHA_NLC_F14F15_UnifiedControl_v1_43_0.html` — the prototype that is the behavioral source of truth (required).
> 2. `FGEHA_NLC_Continuation_Prompt.md` — the granular feature/build log (required; it lists every feature and convention).
> 3. `fgeha_nlc_schema.sql` — the PostgreSQL data model (the type source of truth).
> 4. `FGEHA_NLC_API_Contract.md` — the REST contract the app must talk to.
> 5. `FGEHA_NLC_Target_Architecture_and_Data_Model.md` — the enterprise architecture and migration milestones.
> 6. The `tests/` smoke suites (44 files) — the *executable* behavioral spec.
>
> Read all attachments before writing code. Then follow §0 (clarifying questions) before generating anything.

---

## 0. Behavioral rules for the building agent (read first)

1. **Ask 2–4 clarifying questions before writing any code** (see §13 for the menu). Never skip this even if the task looks clear.
2. **Preserve every existing feature.** This is a *port*, not a redesign. The single-file prototype and its 44 passing smoke suites define correct behavior. Feature parity is the primary acceptance gate (§11).
3. **Work in scoped, tested increments** with zero regressions, matching the discipline that built the prototype. One feature area per pull request.
4. **Respect the data-residency constraint** (§3). The live multi-user app and real data run on the organization's own infrastructure, *not* on public GitHub. GitHub is for source, CI, and a static demo only.
5. **Be honest about scope.** A full feature-complete port is a multi-week effort; deliver it in the phases of §12, each independently shippable.

---

## 1. Mission

Re-implement the **FGEHA × NLC Unified Project Control** application — currently a ~1.5 MB single-file HTML prototype (v1.43.0) — as a modern, maintainable **React + TypeScript** application with the **identical feature set**, wired to the existing backend **API contract**, with automated tests and CI/CD, and deployable two ways: as a **static demo on GitHub Pages** and as the **full multi-user app on on-prem infrastructure**.

The domain is construction & financial project control for an organizational hierarchy (HQ NLC → HQ Engineers → 5 PD HQs → projects), managing BOQ, baselines, IPC/RAR registers, financials, execution progress, BOQ→WBS/material mapping, procurement with approval chains, command roll-up dashboards, exports, comments, and role-based access.

## 2. Source-of-truth hierarchy (resolve conflicts in this order)

1. **Behavior:** the prototype HTML + the 44 smoke suites. If unsure how a feature should behave, open the prototype and match it.
2. **Data shapes / types:** `fgeha_nlc_schema.sql`.
3. **Server interface:** `FGEHA_NLC_API_Contract.md`.
4. **Direction & constraints:** the architecture doc.

## 3. Deployment model (this shapes the whole build — read carefully)

GitHub Pages serves **static files only** — no Node server, no PostgreSQL. The backend therefore **cannot run on Pages**. Hosting live FGEHA/NLC data on public GitHub also conflicts with the agreed **on-prem / government data-residency** requirement. The resolution, which the architecture must support from day one:

Build the data layer behind a single **`DataProvider` interface** with two interchangeable implementations:

- **`ApiDataProvider`** — talks to the on-prem backend per `FGEHA_NLC_API_Contract.md` (real auth, server-enforced RBAC, PostgreSQL). This is the production path; it is deployed on the organization's infrastructure.
- **`LocalDataProvider`** — a client-only adapter backed by `localStorage` (and seedable from the existing JSON backup files), reproducing the prototype's single-user behavior with **no server**. This is what the **GitHub Pages static demo** uses.

A build-time flag (`VITE_DATA_MODE = api | local`) selects the provider. The **same React codebase** ships both ways. Document loudly in the README that the Pages demo is single-user/client-only and is **not** for real data.

| Target | What runs there | Data | Use |
|---|---|---|---|
| **GitHub repo** | source + CI only | none (no real data, no secrets; demo JSON ok) | version control, code review |
| **GitHub Pages** | static React bundle (`local` mode) | browser `localStorage` | public/demo, parity showcase |
| **On-prem server** | the same bundle (`api` mode) + Node API + PostgreSQL | central DB | the real multi-user system of record |

## 4. Tech stack (defaults — confirm or override in §13)

- **Build:** Vite + React 18 + TypeScript (strict).
- **Routing:** React Router (data router). Deep-linkable routes mirror the prototype's `#node=<id>` deep links.
- **Server state / data fetching:** TanStack Query over the `DataProvider`.
- **Client/UI state:** Zustand (lightweight; for filters, command palette, theme, undo toasts).
- **Forms & validation:** React Hook Form + Zod (Zod schemas double as the runtime validation that mirrors the contract).
- **Charts:** Recharts or Chart.js (the prototype uses Chart.js + hand-built SVG; match the S-curve, cash-flow, pipeline, league visuals).
- **Tables:** TanStack Table (registers, league table, portfolio list — sortable, bulk-select).
- **Excel export:** SheetJS (the prototype already uses it; keep the same export shapes).
- **Styling:** CSS variables for the NLC brand tokens (§8) + a utility layer (Tailwind acceptable) — must support light/dark themes via `data-theme`.
- **Testing:** Vitest + React Testing Library (unit/component), Playwright (e2e). Port the *assertions* of the 44 smoke suites into Vitest where they test logic, and into Playwright where they test flows.
- **Lint/format:** ESLint + Prettier.
- **i18n:** scaffold react-i18next (English now; Urdu is on the backlog — keep strings externalized).

## 5. Monorepo layout

```
fgeha-nlc/
├── README.md
├── .github/workflows/        ci.yml, pages.yml   (see §10)
├── apps/
│   └── web/                  the React app (Vite)
│       ├── src/
│       │   ├── data/         DataProvider interface + ApiDataProvider + LocalDataProvider
│       │   ├── types/        TS types generated/derived from fgeha_nlc_schema.sql
│       │   ├── domain/       pure logic ported from the prototype (KPIs, rollups, RAG, S-curve weighting, chain resolution)
│       │   ├── features/     one folder per feature area (§6)
│       │   ├── components/   shared UI (brand system, tables, charts, modals, toasts)
│       │   ├── routes/       route tree
│       │   └── app/          providers, theme, auth context
│       └── tests/            vitest + playwright
├── server/                   the existing Node/Express/TS reference backend (api mode)
├── db/                       fgeha_nlc_schema.sql + migrations + importer (backup JSON -> SQL)
├── docs/                     the architecture + API contract + this prompt
└── prototype/                the v1.43.0 HTML (reference + the local-demo seed source)
```

## 6. Complete feature inventory (ALL must be ported — this is the parity checklist)

Group every item below into a `features/` folder and a parity test. Nothing here is optional.

**Org hierarchy & navigation**
- Org tree: HQ NLC → HQ Engineers → 5 PD HQs (North/Centre/KPK/Sindh/Bln) → projects; editable PD-HQ tree (add/rename/remove PD HQ, reparent projects) preserving the fixed 3-level shape.
- Active-node model; guided drill-down shell where node *type* decides the screen (branch → command dashboard; project leaf → tabbed control center).
- Top-bar org navigator (select any node), persistent breadcrumb with ancestor links + "drill into" child chips.
- Shareable deep-link URLs reflecting the current node.
- Project switcher (access-filtered, active project always visible), archive/restore (soft delete, never the last live project), hard delete (archived only).

**Per-project control center (tabs):** Executive, Commercial, Execution, Mapping, Procurement, Financial.

**Commercial**
- BOQ (12 bills / 434 items model), per-project BOQ import (xlsx/csv upload + paste, fuzzy column mapping, preview).
- IPC register + pipeline (`draft → submitted → vetted → forwarded_to_client → approved → paid_pending_ack → paid`) with workflow actions.
- RAR register + pipeline (`draft → submitted → verified → approved → marked_payment → paid`), subcontractors, RAR↔IPC recovery links, hybrid auto-suggest recovery.
- EPC / escalation certificates; distributions/allocations (allocation-keyed, not BOQ-keyed); mobilization & secure advances.
- Register editor: bulk-select + bulk status change + inline notes (amounts read-only).

**Baselines & execution**
- Per-project S-curve baseline (planned %) and Primavera-style schedule/WBS (activities, milestones, dates); baseline import (xlsx/csv + paste).
- Monthly execution progress (actuals); store/plant/equipment ledgers; lookahead.
- Weighted aggregate S-curve at branch nodes (contract-value-weighted; planned vs actual + slippage), interactive (per-month hover tooltips, point markers, toggleable series).

**Financial**
- 7 sub-tabs: Dashboard, Receipts, Payments, Liabilities, Cash Flow, Planned vs Actual, P&L.
- Receipts/payments register-mirror; liabilities (outstanding RAR + retention held).
- Cash-flow chart (full-column hover tooltips) + cash-flow forecast (N=3/6/12, trailing-3-avg, plannedOverheads substitution).
- P&L statement + monthly breakdown + period comparison; 18 KPIs (through Avg Monthly Cash Flow, Months Cash on Hand); print stylesheets.

**Mapping**
- BOQ→WBS and BOQ→material mapping with coverage metrics (`confirmedPct/autoPct/disputedPct/unmappedPct/wbsCoverage`).

**Procurement**
- Demands (material / machinery / machinery_hire) with item builder + BOQ item picker; POs (issue from demand, close); CRVs (cumulative over-receipt detection); procurement payments.
- Six approval chains with correct mid-chain divergence (material/machinery demand `recommend→endorse→approve`; `machinery_demand` skips endorse; 9-stage vs 6-stage payment chains) — drive transitions from the chain definition, never hardcode.
- Material issues (self_use / sublet_issue / batching_plant), production runs, machinery hires (per_day/per_hour/lumpsum) + utilization, suppliers; admin-editable financial-power thresholds; approval inbox per role.

**Command dashboards (branch nodes)**
- Node KPI roll-up, drill-down child list with subtotals, node cash flow, consolidated IPC/RAR registers, subtree project list — all **access-scoped inside the aggregation**.
- Exceptions feed (red/amber), cross-node league table (click-to-sort, drill), billing pipeline funnel.
- RAG health with **adjustable thresholds** (live recolour), per-node comments/notes.

**Cross-cutting interactivity**
- Persistent global filter bar (search / client / RAG) with **true re-aggregation** of all roll-ups (recursion-guarded for the RAG predicate).
- Command palette (Ctrl-K) + recent nodes + keyboard nav; undo toasts; type-aware empty states.
- Excel export (registers + node roll-up); per-node one-page printable export brief (with RAG badge + weighted S-curve).

**Access, security, admin, persistence**
- Roles (14) + ~79 permissions; per-project role access; per-project approval-chain role overrides — **enforced server-side in `api` mode**, advisory-only in `local` mode (state that clearly in the demo).
- Settings module: project CRUD, salients editor, demo-data load/remove, RAG settings, access matrix, approval-chain editor, financial powers.
- Write-time text sanitization on all free-text (comments, notes, salients) + render-layer escaping; finish the app-wide escaping audit during the port.
- Full backup/restore JSON (import/export) — in `local` mode this is the persistence; in `api` mode it maps to the importer/export endpoints.
- Audit log of every mutation.
- Theme (auto/light/dark); demo datasets (the 9-project and 21-project backups) as the `LocalDataProvider` seed.

## 7. Data & domain layer

- **Types:** derive TypeScript interfaces from `fgeha_nlc_schema.sql` (one type per table; money as `string` to preserve decimals). Keep them in `src/types/`.
- **Domain logic:** port the prototype's pure compute functions into `src/domain/` as framework-free, unit-tested modules — KPI computation, `computeNodeRollup`, RAG health + thresholds, weighted S-curve (the controlled weighting case `1000@50% + 3000@100% → 87.5%` must still hold), cash-flow bucketing, approval-chain stage resolution, cumulative CRV over-receipt. These are the same algorithms; just relocate and test them.
- **DataProvider interface:** every screen reads/writes through it. `ApiDataProvider` maps methods to the contract's endpoints (and surfaces the standard error envelope + `409` optimistic-lock conflicts); `LocalDataProvider` implements the same methods over `localStorage` with the working-set/stash model the prototype uses.

## 8. Design system (NLC brand — match the prototype)

Use CSS variables in two `:root[data-theme]` blocks. Tokens (light / dark): brand orange `#E87722` / `#FF8C3A`; header charcoal `#3D3D3D` / `#050810`; warn `#B06820` / `#F0A040`; success `#2D5F3F` / `#10B981`; danger `#8B1A1A` / `#EF4444`; info `#1E3A5F` / `#38BDF8`. No hardcoded hex outside the token blocks. Header identity: NLC Engineer Command Centre at branch nodes; project name + client salients at project leaves. Target an enterprise look; ensure WCAG AA, responsive/mobile layouts, and keyboard accessibility.

## 9. Routing map (deep-linkable)

`/` → active node (command dashboard or project tabs by node type); `/node/:nodeId` (replaces `#node=`); `/node/:nodeId/:tab` for project tabs; `/settings/*` for admin sub-screens; preserve back/forward and shareable URLs.

## 10. GitHub setup & CI/CD

**Repository:** private repo (or on-prem GitHub Enterprise / GitLab for full data-residency). Add `.gitignore` excluding `node_modules`, build output, `.env*`. **Never commit secrets or real data**; the demo JSON backups are fine. Configure branch protection on `main` (PR + green CI required).

**`.github/workflows/ci.yml`** — on PR and push:
- install, `tsc --noEmit`, ESLint, Vitest (unit/component) with coverage.
- Build the web app in both `local` and `api` modes to catch mode-specific breakage.
- Spin up a **PostgreSQL service container**, load `db/fgeha_nlc_schema.sql`, typecheck/build `server/`, and run the server integration tests against it.
- (Optional) rebuild the legacy prototype chain and run its 44 smoke suites as a parity guard during the transition.
- Run Playwright e2e against the `local`-mode build (no backend needed).

**`.github/workflows/pages.yml`** — on push to `main`:
- Build the web app with `VITE_DATA_MODE=local` and the correct Pages `base` path, then deploy the static bundle to **GitHub Pages**. This publishes the single-user demo only.

**Production (NOT GitHub):** document the on-prem deploy — build with `VITE_DATA_MODE=api`, serve the static bundle from the org's web tier, run `server/` + PostgreSQL inside the network, behind AD/SSO. Provide a `docker-compose` for local full-stack dev (web + api + postgres) and Dockerfiles, but make clear production deployment targets org infrastructure.

## 11. Definition of done (acceptance criteria)

1. **Feature parity:** every item in §6 works; demonstrate with a parity matrix mapping each prototype feature to its React screen + a passing test.
2. **Tests green:** unit/component (Vitest), e2e (Playwright), and server integration all pass in CI; domain logic tests reproduce the prototype's key numeric assertions (rollup reconciliation, weighted S-curve, RAG thresholds, CRV over-receipt, chain divergence).
3. **Both modes build and run:** `local` (Pages demo) and `api` (against the reference backend).
4. **Quality:** strict TypeScript clean, ESLint clean, WCAG AA, responsive, light/dark themes, deep links, Ctrl-K palette, exports, print views.
5. **Security:** `api` mode relies on server-enforced RBAC; all free-text sanitized/escaped; no secrets in the repo.
6. **Docs:** README with run/build/deploy for all three targets; an architecture note for the data layer.

## 12. Phased delivery (each phase is an independently shippable PR set)

1. **Scaffold + data layer + design system** — repo, CI skeleton, `DataProvider` with `LocalDataProvider`, types, brand tokens, app shell, routing, theme. Pages demo deploys with an empty shell.
2. **Org + command dashboards** — tree, navigator, breadcrumb, node roll-up, child list, exceptions/league/pipeline, RAG + thresholds, deep links, filter bar.
3. **Project control center** — Executive + Commercial (BOQ, IPC, RAR, register editor) + the pipelines.
4. **Execution + mapping + baselines** — schedule/WBS, monthly progress, resources, BOQ↔WBS/material, weighted S-curve.
5. **Financial** — all 7 sub-tabs, KPIs, cash-flow + forecast, P&L, print.
6. **Procurement** — demands/POs/CRVs/payments, six chains, materials/machinery/suppliers, inbox, financial powers.
7. **Cross-cutting + admin** — command palette, undo, empty states, comments, exports/brief, settings (CRUD/salients/demo/access matrix/chain editor), backup-restore, audit.
8. **`api` mode wiring + e2e + a11y/i18n hardening** — point `ApiDataProvider` at the backend, full e2e, accessibility and Urdu-readiness pass.

## 13. Clarifying questions to ask before building (pick the live ones)

- Stack confirmations: Vite vs Next.js (SSR not required for an internal app — default Vite)? TanStack Query + Zustand acceptable, or a preferred store? Recharts vs Chart.js for parity?
- Demo seed: which backup powers the Pages demo — the 9-project or 21-project file?
- Repo location: public GitHub (demo only) vs private vs on-prem GitHub Enterprise — and is the backend in the same monorepo or a separate repo?
- Auth in `api` mode for development: OIDC against a test IdP, or the scaffold's dev header until the IdP is ready?
- Scope of the first milestone: full parity is multi-week — confirm the phase order in §12, or name the one screen to prove the pipeline end-to-end first.

---

### Guardrails (non-negotiable)
- Don't drop features; the prototype is the contract.
- Don't put real data or secrets on public GitHub; the live backend runs on-prem.
- Don't hardcode approval-chain transitions or brand colors.
- Don't claim a phase done without passing tests and a parity check against the prototype.
- Ask before introducing architecture not described here (a different backend, SSR, micro-frontends, etc.).
