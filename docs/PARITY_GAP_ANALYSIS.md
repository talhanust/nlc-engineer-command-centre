# Original HTML (v1.43.0) → React app — function-level gap analysis

Source audited: FGEHA_NLC_F14F15_UnifiedControl_v1_43_0.html (27,049 lines).
Method: enumerated all JS function declarations + UI actions and diffed against the app.

## Closed in this pass (the two you asked about)
- **Create project** — `addProject` / `createProjectWithBoq` → "+ New project" on any
  PD/HQ dashboard; creates the project + its org node, persists, navigates to it.
- **Add PD HQ** — `addPdHq` → Settings → Organisation.
- **Progress updation** — `openPeriodEditor` / `setMonthlyActual` → "Update progress" on a
  project: edit planned/actual %, billed, received, and per-month cumulative actuals.
- **Archive / restore project** — `archiveProject` / `hardDeleteProject` → Archive on a
  project; restore in Settings → Organisation.

## Still missing (prioritised for next passes)
1. **Baseline file upload** — `handleScheduleFile`, `handleScurveFile`, `_readBaselineFile`,
   and paste parsers (`parseSchedule*`, `parseScurve*`) for BOQ / schedule / S-curve.
   (App currently: BOQ paste/CSV only; xlsx upload pending.)
2. **Register-level Excel exports** — `exportBOQ`, `exportIPCExcel`, `exportRARExcel`,
   `exportAdvancesExcel`, `exportRegisterXlsx`, `exportDistribution`. (App: node-rollup xlsx only.)
3. **Entity detail modals** — `openIPCDetail`, `openRARDetail`, `openSubDetail`,
   `openDemandView`, `openPoView`, `openProcPaymentView`, etc. (App: inline rows, no detail drill-in.)
4. **Period mapping** — `confirmPeriodMapping`, `computePeriodMappingCoverage` (map IPC/RAR
   periods onto schedule months for divergence).
5. **Secured sub-account flows** — `openSec*` family (secured client receipts / sub-disbursements).
6. **Admin panel & access migrations** — `openAdmin`, `migrateAccessControl`,
   `migrateProjectBaselines/Boq` (one-off data migrations; partly N/A for the React data model).

## Backend / integration (separate phase)
- `api` mode → reference server + OIDC; access matrix → server-side RBAC; Playwright e2e.
