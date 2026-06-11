# NLC Engineer Command Centre — Backlog

## Done
- **Phase 1–2** — scaffold, data layer (DataProvider: local + api), design system, org-tree navigator, routing, command dashboards (KPIs, child subtotals, RAG), exceptions feed, league table, billing funnel, adjustable RAG thresholds, per-node comments, global filter with re-aggregation, weighted portfolio S-curve.
- **Phase 3** — Commercial: BOQ register + paste/CSV import, IPC register + pipeline, RAR register + pipeline, RAR↔IPC recovery links, subcontractors, EPC, advances, distributions, bulk register editor.
- **Phase 4** — Execution (schedule/WBS, S-curve + monthly actuals, resources), Mapping (BOQ→WBS, BOQ→material, coverage), weighted aggregate S-curve at branch nodes.
- **Phase 5** — Financial: KPI dashboard, receipts/payments/liabilities registers, cash-flow + forecast (3/6/12), P&L.
- **Phase 6** — Procurement: demands (3 types, item builder + BOQ picker), six approval chains (with mid-chain divergence), financial powers, approval inbox, POs, CRVs (over-receipt detection), payments, suppliers, machinery hires.
- **Phase 7** — Cross-cutting: command palette (Ctrl-K), CSV export + printable node brief, Settings (backup/restore, financial-powers editor), append-only audit log of workflow events.

## Remaining / follow-on
- **Backend wiring** — connect `api` mode to the reference server + OIDC; replace the role selector with real RBAC (the access matrix maps to it); Playwright e2e.
- **Imports** — xlsx UPLOAD (SheetJS) for BOQ and schedule baselines (export is done; import pending).

All prototype feature areas are now ported: commercial (BOQ/IPC/RAR/EPC/retention/reconciliation/advances/distributions), execution (schedule/Gantt/lookahead/S-curve/production+materials/resources), mapping, financial (KPIs/EVM/cash-flow/working-capital/margin-by-bill/P&L), procurement (demands/chains/inbox/POs/CRVs/payments/suppliers/hires+utilization), and cross-cutting (palette, settings incl. currency/powers/access-matrix, salients, audit+reverse, CSV+Excel export, print).