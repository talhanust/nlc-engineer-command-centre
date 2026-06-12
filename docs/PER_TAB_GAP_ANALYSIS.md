# Per-tab / per-page gap analysis — original v1.43.0 vs app

Legend: ✓ in app · ➕ added this pass · ✗ still missing

## App-wide / Executive
- ✓ Org tree (HQ→PD→project), command dashboards, KPIs, RAG, exceptions, league table, billing funnel
- ✓ Global filter + re-aggregation; command palette (Ctrl-K); comments; CSV/Excel/print
- ➕ Create project / Add PD HQ / archive + restore; Update-progress editor (per-month actuals)
- ➕ Project location + **portfolio map**; **progress photo gallery**; original colour scheme
- ✗ Recent-nodes shortcut bar; per-node printable board-pack PDF; saved filter presets

## Commercial
- ✓ BOQ (paste/CSV/➕xlsx import, ➕Excel export), IPC register + pipeline, RAR + recovery,
  retention timeline, reconciliation, escalation calculator + EPC, advances, distributions, subs
- ➕ IPC deduction waterfall (WHT bands); bulk register editor
- ➕ Entity **detail modals** — IPC (waterfall+recovery+audit), RAR (recovery+audit) done; sub detail ✗
- ➕ Register exports for RAR / advances / distributions (IPC + BOQ already done)
- ✗ Secured-account flows (secured client receipts, secured sub-disbursements)
- ✗ Vetting modal workflow; client-receipt posting against IPCs

## Execution
- ✓ Schedule + **Gantt**, ➕schedule baseline import; lookahead; S-curve (+➕import, ➕zoom),
  editable monthly actuals; production runs + material issues + reconciliation; resources
- ✗ Period mapping (map IPC/RAR periods → schedule months; divergence coverage)
- ✗ Resource histogram / S-curve combined (execRsCombinedChart)
- ✗ Twin S-curve divergence band annotation

## Mapping
- ✓ BOQ→WBS, BOQ→material coverage
- ✗ Bill/category filter dropdowns on the mapping grid (populate*Filter functions)
- ✗ Mapping-driven weighted planned/actual rollup preview

## Financial
- ✓ KPI dashboard, EVM, cash-flow (+➕zoom), working capital, margin-by-bill, P&L, receipts/payments/liabilities
- ✗ Monthly overhead model (ensurePlannedOverheads/computeMonthlyOverhead)
- ✗ P&L-for-period drill; financial source drill-throughs (openFinancial*Source)

## Procurement
- ✓ Demands (3 types, item builder, BOQ picker), six approval chains, inbox, financial powers,
  POs, CRVs (over-receipt), payments, suppliers, machinery hires + utilisation
- ➕ Demand, **PO** and **payment** detail views (items/chain/history/CRVs/audit) done; issue-PO-from-demand modal ✗

## Settings / Admin
- ✓ Currency format, backup/restore, financial-powers editor, **access matrix**, audit log,
  ➕ organisation (add PD HQ, restore archived)
- ✗ Full admin panel (openAdmin) with user management; data migrations UI
