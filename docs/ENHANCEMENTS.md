# Enhancement pass — charting & visual system

## Done
- Migrated charts from hand-rolled SVG to **recharts** (interactive tooltips, legends, responsive).
- New/upgraded charts: twin S-curve (area+line), portfolio S-curve, cash-flow (bars + cumulative line),
  **EVM** (PV/EV/AC), **Gantt** (schedule activity windows), distribution doughnut, cost-by-category bar,
  top-subcontractors bar.
- Rebuilt design system: command-centre identity (deep-green header), Archivo/Inter/IBM Plex Mono
  typography, KPI cards with mono figures + RAG accent, refined tables/tabs/pills, light + dark.
- recharts code-split into its own cacheable vendor chunk; ResizeObserver polyfilled for tests.

## Remaining feature gaps vs the original (prioritized)
1. ~~Reconciliation views (RAR↔IPC)~~ — DONE (per-IPC recoveries + per-RAR outstanding).
2. ~~Execution lookahead~~ — DONE (rolling 4/8/12-week).
3. ~~Retention timeline~~ — DONE (cumulative chart + ledger + 50/50 release).
4. ~~Detailed deductions (WHT bands) + escalation formula~~ — DONE (per-IPC waterfall, filer/non-filer, escalation calculator).
5. ~~Machinery utilization~~ — DONE (entry + units chart + cost).
6. ~~Working-capital + margin-by-bill charts~~ — DONE (WC position on dashboard, margin-by-bill on P&L).
7. ~~Production runs / material issues + material reconciliation~~ — DONE (Execution → Production & materials).
8. ~~Transaction reverse (audited)~~ — DONE (IPC reverse steps status back + audit).
9. ~~Excel (xlsx) export~~ — DONE (multi-sheet workbook, lazy-loaded SheetJS). Material recon still pending.
10. ~~Project salients editor + access matrix~~ — DONE (executive tab + Settings).
