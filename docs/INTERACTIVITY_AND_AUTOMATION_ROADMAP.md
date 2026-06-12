# Interactivity, tech-stack & automation roadmap

## Shipped this pass
- **Baseline upload** — Execution → Schedule and → S-curve now accept **.xlsx/.csv upload OR
  paste**, with a live preview and "Apply baseline" (flexible header mapping). BOQ already had
  paste/CSV; now exports too.
- **Register Excel export** — BOQ and IPC registers export multi-sheet .xlsx (SheetJS, lazy-loaded).
- **Chart zoom/scrub** — S-curve and cash-flow charts gained a recharts **Brush** (drag to zoom a
  date window) when there are enough points.

## Interactivity to add next (incremental, low-risk)
1. **Global date-range + multi-select filters** — a toolbar with month-range slider, client
   multi-select, RAG multi-select, and node scope. (FilterBar exists; extend to dropdown chips +
   range. Library: `@radix-ui/react-select` / `react-day-picker`.)
2. **Sortable/filterable data grids** — replace hand-rolled tables in registers with **TanStack
   Table** (column sort, per-column filter, pagination, column show/hide, CSV/Excel export hooks).
3. **Chart toolkit upticks** — fullscreen toggle, export-PNG, crosshair tooltips, reference bands
   (target vs actual). recharts supports most; `recharts-to-png` for export.
4. **Command-palette actions** — extend Ctrl-K from navigation to *actions* ("New project",
   "Import schedule", "Export IPC") via a small command registry.
5. **Drag-and-drop** — reorder BOQ bills / kanban the IPC pipeline with `@dnd-kit/core`.
6. **Map view** — plot projects on a Pakistan map by PD HQ region (`react-simple-maps` or MapLibre).

## Recommended tech-stack additions (when wiring the backend)
- **Data fetching/caching:** TanStack Query (cache, retries, optimistic updates, background refetch).
- **Forms/validation:** React Hook Form + Zod (shared client+server schemas).
- **State:** Zustand for cross-cutting UI state (filters, role) beyond React context.
- **Tables:** TanStack Table (above).
- **Auth:** OIDC via `oidc-client-ts` / NextAuth-style flow → maps to the existing access matrix.
- **Realtime:** WebSocket/SSE for live audit feed + multi-user updates.
- **E2E:** Playwright; **component stories:** Storybook.

## Automation
- **CI/CD (have CI):** add auto-deploy of `api` build to on-prem on tagged releases; DB migrations
  via `node-pg-migrate` run in the pipeline.
- **Scheduled rollups:** a nightly job to snapshot KPIs/EVM per node (history + trend sparklines).
- **Alerts:** rules engine on RAG/slippage/over-receipt/negative-stock → email/Teams/Slack webhook.
- **Ingestion:** watch a shared folder / email inbox for BOQ & schedule workbooks → auto-import
  (reuses the parsers shipped today) with a review queue.
- **Document generation:** scheduled PDF/Excel board packs per PD HQ (node brief already prints).
- **Forecasting:** auto-extend the S-curve / cash-flow forecast from actuals (trend + EVM CPI/SPI).

## Added this pass
- **Original colour scheme** applied (charcoal header + NLC-orange accent, cream surfaces,
  Bebas Neue / IBM Plex type, sharper radii).
- **Progress photo gallery** per project (add by URL, lightbox zoom, delete).
- **Project location + Pakistan portfolio map** (offline SVG locator, RAG-coloured markers,
  click-to-open; location editor with lat/lng).
- Chart **zoom/scrub** (previous pass) on S-curve & cash-flow.

## "Automate everything" — a logical end-to-end automation blueprint
Initiate → Process → Track, each stage event-driven:
1. **Initiate**
   - New project wizard auto-seeds registers + a baseline import step (parsers shipped).
   - Watched inbox/SharePoint folder: a dropped BOQ/schedule workbook auto-creates a draft import.
2. **Process (workflow engine)**
   - Demands/IPCs/RARs/payments already model approval chains + financial powers; turn these into a
     server-side **state machine** so each transition is API-enforced (RBAC via the access matrix),
     time-stamped, and notification-bearing (email/Teams) to the next approver's inbox.
   - Auto-compute deductions/escalation/retention on IPC creation; auto-post recoveries to linked RARs.
3. **Track**
   - Nightly **rollup snapshots** → trend sparklines + EVM CPI/SPI; auto-extend forecasts.
   - **Rules/alerts engine**: RAG breach, slippage > X%, CRV over-receipt, negative material stock,
     retention due-for-release, IPC ageing in a stage → push alert + create a task.
   - **Scheduled board-packs** (PDF/Excel) per PD HQ emailed weekly.
   - **Audit everything** (already append-only) → exportable compliance log.

## More innovative enhancements to consider
- Interactive map upgrade to **MapLibre + OSM** (online) with draw-to-set-location and geofenced sites.
- **Photo gallery from real uploads** (object storage / S3) with EXIF date + GPS auto-placing on the map.
- **Drag-drop kanban** for the IPC/demand pipelines (@dnd-kit); **TanStack Table** grids with column
  filters, sort, pagination, CSV/Excel.
- **Live multi-user** presence + audit feed over WebSocket; optimistic updates via TanStack Query.
- **What-if forecasting** sliders (push a month's actual, watch EVM/cash-flow re-forecast).
- **AI assist**: natural-language query over the portfolio ("show red projects in Sindh with slippage>10%")
  and auto-drafted progress narratives from the numbers.
