# Commercial Module — Feature Guide

**Audience:** engineers and contract staff working on or with the NLC Engineer Command Centre commercial module.
**Scope:** the Commercial tab of a project workspace, its sub-tabs, the pure domain engines behind them, the data model, role-based access, document generation, and how everything persists. This is the consolidated reference for the commercial build; the per-slice history lives in `journal.txt`.

---

## 1. What the module does

The commercial module runs the money side of a construction contract end to end: from the priced Bill of Quantities, through how work is distributed (self-performed vs sublet) and executed, into client billing (IPCs) and subcontractor billing (RARs), and out to reconciliation, escalation, retention, advances, aging, margin, cash flow, earned value and a portfolio roll-up. Every figure on a dashboard traces back to one of a handful of small, pure functions in `apps/web/src/domain/`, each unit-tested. The screens are thin: they load data through the provider, call a domain function, and render.

A single worked example threads through the whole module — the F-14/F-15 Islamabad project (`proj-f14f15`), seeded with a BoQ, distributions, IPCs, RARs, variations, bank guarantees and escalation indices so the screens are populated out of the box.

---

## 2. Sub-tab map

The Commercial tab (`screens/commercial/CommercialTab.tsx`) renders an alerts banner, a sub-tab strip, and the active sub-tab. The order is the contract lifecycle, not alphabetical:

Dashboard · Bill of Quantities (the default landing) · Generate IPC · IPC register · Generate RAR · RAR Register · Reconciliation · Cash flow · Retention · Calendar · Escalation · Contractors · Distribution planner · Execution tracker · Variations · Distributions · Advances · Aging · Margin analytics · Earned value.

---

## 3. The spine: BoQ → distribution → execution → billing → reconciliation

The BoQ is the backbone. Each `BoqItem` carries a bill, code, description, unit, quantity, rate and amount. From there:

- **Distribution** decides *who does the work*. Each `Distribution` maps a BoQ item to a mode — unassigned, self, or sublet (with a subcontractor) — and an allocated quantity. The Distribution Planner is where this is set; `domain/boqrollup.ts` and `domain/allocations.ts` roll the splits up.
- **Execution** records *what got built*. `ProgressUpdate` rows capture executed quantity per BoQ item per period, draft or validated. The Execution Tracker drives these.
- **IPC** (Interim Payment Certificate) bills the *client*. An `Ipc` carries a gross, the deduction-derived net, a cumulative gross and optional `IpcLine[]`. The Generate IPC wizard builds lines from executed work; `domain/ipc.ts` computes the deduction waterfall (gross → retention → income tax → advance recovery → net) and owns the status pipeline.
- **RAR** (Running Account Receipt) bills NLC's *subcontractors*. A `Rar` mirrors the IPC shape with `RarLine[]` and its own pipeline in `domain/rar.ts`.
- **Reconciliation** (`domain/reconcile.ts`) closes the loop: per-IPC and per-contractor views, an over-claim check (RAR gross vs distributed cost), and a RAR↔IPC linker that suggests IPCs to a RAR by BoQ-item overlap.

---

## 4. Domain engines

Every engine is a pure module under `apps/web/src/domain/`, imported by exactly the screens that need it and tested in `domain/commercial.test.ts` (or a sibling `*.test.ts`).

- **ipc.ts** — deduction breakdown, `computeNet`, the six-stage IPC pipeline with a responsible role per transition, vetted/paid-by-item helpers feeding BoQ progress.
- **rar.ts** — the RAR pipeline (submit → verify → approve → mark-for-payment → pay), each step role-stamped.
- **reconcile.ts** — distributed cost, KPIs, per-IPC / per-contractor rows (with over-claim flags), and BoQ-overlap link suggestions.
- **escalation.ts** — price-adjustment coefficient Pₙ from a weighted index basket (PBS components), per-component contributions.
- **retention.ts** — retention timeline and summary: deducted, cap, cap-used %, and the release split (half at substantial completion, half after the DLP).
- **advances.ts** — two-sided advance ledger summary, bank-guarantee expiry status and active cover.
- **aging.ts** — days-in-stage per in-pipeline document, urgency tiers (medium / high / critical) by multiple of a stage threshold.
- **marginanalytics.ts** — gross revenue, sub/labour cost, gross margin, net working capital, top contractors and risk items.
- **commercialcashflow.ts** — period inflow (IPC net) vs outflow (RAR net) and cumulative net.
- **variations.ts** — change-order pipeline and `revisedContractValue` (see §5).
- **evm.ts** / **portfolio.ts** — earned value at project and portfolio level (see §6).
- **alerts.ts** — health signals aggregated into a banner (see §8).
- **calendar.ts** — forward expiry/release calendar (see §9).
- **certificate.ts** — IPC/RAR/EPC certificate models for PDF export (see §10).

---

## 5. Variations and the living contract value

A `Variation` is a signed change order (addition, omission, substitution or rate change) moving through draft → submitted → recommended → approved, with a reject off-ramp. `variationSummary` separates approved from pending and computes `revisedContractValue = original + Σ approved`. That revised figure is not cosmetic: it flows into the Dashboard contract-value tile, the Retention cap (5% of the *revised* contract), and the EVM budget-at-completion. Approving a variation therefore ripples through retention headroom and schedule/cost baselines automatically.

---

## 6. Earned value and the portfolio roll-up

`domain/evm.ts` takes {BAC, PV, EV, AC} and derives schedule and cost variances, SPI and CPI, and the EAC / ETC / VAC forecasts, plus an ahead/on/behind classifier. On the Earned Value sub-tab, BAC is the revised contract value, PV and EV come from the project's planned and actual physical percentages, and AC is RAR booked gross plus self-performed work costed at 85% of earned value (an assumption stated in the UI). This is the first metric that joins the physical-progress and financial-actuals sides of the platform.

`domain/portfolio.ts` lifts the same idea to a node: `portfolioEvm` aggregates BAC/PV/EV value-weighted across the in-scope projects and gives each a schedule index (SPI = actual% / planned%). The PortfolioPerformance card on the node command dashboard shows portfolio SPI and a per-project table sorted worst-schedule-first, each row drilling into that project's Commercial tab. It respects the dashboard's RAG/filter scope.

---

## 7. Retention, advances, escalation, aging, margin, cash flow

These are the standing registers. Retention shows the accrual timeline, the cap and the DLP-split release plan. Advances is a two-sided ledger (client receipts and sub disbursements) with a bank-guarantee register and expiry tracking. Escalation maintains the PBS index master, computes Pₙ, and generates an Escalation Payment Certificate (EPC) per IPC through the same pipeline as IPCs. Aging ranks in-pipeline documents by how long they have sat in a stage. Margin analytics and Cash flow give the profitability and liquidity reads. Each is a thin screen over its domain engine.

---

## 8. Coverage health & alerts

`domain/alerts.ts` aggregates three health signals into a single severity-ranked list: over-claimed contractors (from reconciliation), critically or highly aged documents (from aging), and expired or expiring bank guarantees (from advances). The `CommercialAlerts` banner sits above the sub-tabs; collapsed it reads "N items need attention", expanded it lists each issue and drills straight into the relevant register. It re-reads on the `nlc:audit` event, so resolving an item clears it live.

---

## 9. Calendar

`domain/calendar.ts` projects a forward timeline of bank-guarantee expiries (active guarantees with a date) and scheduled retention releases (half at the project completion date, half after a 365-day defect-liability period). Events are bucketed into Overdue / Next 30 / Next 90 / Later horizons with days-until and amounts. The Calendar sub-tab surfaces this so nothing lapses unnoticed.

---

## 10. PDF certificates

`domain/certificate.ts` builds a structured certificate model — parties, reference, period, line items, deduction waterfall, net — for an IPC, RAR or EPC. `components/certificatePdf.ts` renders that model to an A4 PDF via jsPDF (dynamic-imported into its own lazy chunk, browser-only) with an NLC letterhead, a line-item table, the gross-to-net waterfall and dual signature blocks. IPC and RAR register rows each carry a one-click PDF action.

---

## 11. Role-based access (RBAC)

`state/Role.tsx` holds an acting role (a `ROLE_LABEL` key, or `admin` for unrestricted) persisted to local storage, with a `can(required)` helper. The app header carries a role switcher and badge — a development stand-in for real single-sign-on. Every pipeline advance across IPC, RAR, EPC and Variations is gated by the transition's responsible role: blocked steps are disabled with a "Requires <role>" tooltip, enforcing segregation of duties (for example, acting as Finance you can mark a RAR for payment but cannot verify it — that is the Project Manager's step). The default role is `admin`, so nothing is locked until a role is chosen.

Replacing the switcher with a real identity provider is the one open item: wire the header's acting-role to an authenticated user and their granted roles instead of a free choice.

---

## 12. Data model and persistence

Commercial types live in `apps/web/src/data/types.ts`. The app runs on a single `LocalDataProvider` over a pluggable `KvStore`. In local mode the store is `localStorage`; in api mode `initDataBackend()` swaps in `RemoteKvStore`, which hydrates the whole document set once from `/api/state` and writes every change through to `/api/state/:key`. The server (`server/`) persists each document as a JSONB row in `fnpc.app_doc`, keyed exactly like the client store (`nlc-ecc.variations.<projectId>`, `nlc-ecc.bankguarantees.<projectId>`, `nlc-ecc.escindices.<projectId>`, and so on).

The practical consequence: **new commercial entities persist server-side for free.** Because reads and writes go through the KvStore, there is no per-entity REST route to build and no database migration to run — a new document key just rides the existing JSONB store. The legacy `ApiDataProvider` class and its bespoke endpoints are vestigial and never instantiated; `makeDataProvider()` returns `LocalDataProvider` in both modes. Parity is locked in by `data/apiMode.test.ts` (entities round-trip through a fake `/api/state` and survive a fresh hydrate) and `server/test/docstore.test.ts` (commercial keys round-trip as JSONB docs).

---

## 13. Working on the module

Conventions worth knowing before editing:

- Keep logic in a pure domain function and unit-test it; keep the screen thin.
- Money goes through `formatMoney` / `toNum` (`domain/money.ts`); never hand-format.
- Provider changes touch three places in lockstep: the `DataProvider` interface in `types.ts`, the real method in `LocalDataProvider.ts`, and a stub in `ApiDataProvider.ts` so it still typechecks.
- User-entered strings pass through `sanitize`; mutations call `audit(...)`, which both records history and fires the `nlc:audit` event the alerts banner and activity feed listen for.
- Styling uses the design tokens in `theme.css` (`--rag-*`, `--primary`, `--surface*`, `--r*`); no inline colours outside those variables.
- The quality gate that must stay green: web typecheck, web tests, both `VITE_DATA_MODE` builds, and the server typecheck + tests.
