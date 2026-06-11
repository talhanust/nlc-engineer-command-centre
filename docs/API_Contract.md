# FGEHA × NLC Unified Project Control — API Contract (v1)

**Companion to:** `FGEHA_NLC_Target_Architecture_and_Data_Model.md` and `fgeha_nlc_schema.sql`
**Audience:** backend implementers and the UI team doing the `localStorage` → API cutover
**Stack:** intentionally stack-neutral. A Node/Express/TypeScript reference implementation accompanies it, but every endpoint here maps cleanly to .NET, Java/Spring or FastAPI.

---

## 1. Conventions

All paths are prefixed `/api`. Requests and responses are JSON (`Content-Type: application/json`). Times are ISO-8601 UTC. Money is sent as a decimal **string** (e.g. `"19284461163.0000"`) to avoid IEEE-754 rounding on the wire — the same reason the database uses `NUMERIC`. Identifiers that are app-facing (`ipc_no`, `demand_no`, role keys, org-node ids) are strings; internal surrogate keys are integers.

**Authentication.** Every endpoint except the login redirect requires an authenticated session. In production this is an AD/SSO bearer token (OIDC) or session cookie (SAML); the server validates it and resolves the caller to an `app_user` plus that user's `user_role` grants (each optionally scoped to an org node). The reference scaffold uses a development `X-User` header as a stand-in and flags clearly that real IdP integration is migration milestone M3.

**Authorization.** Mutating endpoints pass through the three-axis gate described in the architecture doc §5 — action×role, project×role, and (for procurement) amount×role — plus approval-chain role resolution. Each endpoint below names the gate(s) it applies. `admin` bypasses project-access and financial-power axes.

**Concurrency.** Mutable resources carry a `version` integer. Writes send the version they read; a stale version returns `409 Conflict`. This gives last-writer-protection without locking, matching the prototype's "last-write-wins" note while making the collision visible instead of silent.

**Errors.** A single envelope:

```json
{ "error": { "code": "FORBIDDEN", "message": "role 'qs' may not perform 'ipc.pay'", "details": {} } }
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `VALIDATION` | body failed schema validation |
| 401 | `UNAUTHENTICATED` | missing/invalid token |
| 403 | `FORBIDDEN` | failed an authorization axis |
| 404 | `NOT_FOUND` | resource absent or not visible to caller |
| 409 | `CONFLICT` | stale `version`, or illegal state transition |
| 422 | `BUSINESS_RULE` | e.g. cumulative CRV over-receipt, archiving the last live project |

**Auditing.** Every mutating call writes one `audit_log` row server-side (actor, role, action, ref, before/after, project). The client cannot suppress or forge it.

**Pagination.** List endpoints accept `?limit=` (default 50, max 200) and `?cursor=`; responses carry `{ "items": [...], "next_cursor": "..." | null }`.

---

## 2. Identity & session

```
GET  /api/auth/login        -> 302 redirect to the org IdP (OIDC/SAML)
GET  /api/auth/callback     <- IdP redirect; establishes session, redirects to app
POST /api/auth/logout       -> ends session
GET  /api/me                -> the caller's identity + effective roles
```

`GET /api/me` response:

```json
{
  "user": { "id": 12, "username": "a.khan", "display_name": "A. Khan" },
  "roles": [
    { "role": "pm", "scope_node": "pd-north" },
    { "role": "qs", "scope_node": null }
  ],
  "is_admin": false
}
```

The UI uses this to render the chrome (it replaces the browser role toggle), but it is **advisory for display only** — the server re-checks every action regardless of what the client believes.

---

## 3. The persistence-cutover endpoints (migration milestone M2)

These two replace `localStorage` with the smallest possible surface and are the first thing to ship.

```
GET  /api/projects/{id}/state    -> server-assembled full state document for one project
PUT  /api/projects/{id}/state    <- whole-document save (optimistic-locked)
```

`GET` returns the same slice shape the app already expects (`commercial`, `financial`, `execution`, `mapping`, `procurement`, plus the project's salients), assembled from the normalized tables, with a top-level `version`. `PUT` accepts that document plus the `version` it was read at; the server diffs to normalized rows, writes audit entries, bumps the version, and returns the new version. Gate: `project×role` (write) on `{id}`.

This lets the existing single-file app become multi-user with a two-function change to `saveState`/`loadState` — no UI rewrite.

---

## 4. Projects & org tree

```
GET    /api/nodes                         org tree (caller-visible subtree)
GET    /api/projects                       list — scoped to accessible projects
GET    /api/projects/{id}                  project + salients
POST   /api/projects                       create project          gate: org.project.add
PATCH  /api/projects/{id}                   edit salients           gate: org.project.salients
POST   /api/projects/{id}/archive          soft-delete             gate: org.project.archive  (422 if last live)
POST   /api/projects/{id}/restore          un-archive              gate: org.project.restore
DELETE /api/projects/{id}                   hard delete (archived only) gate: org.project.delete (422 if not archived)
```

`GET /api/projects` returns only projects the caller's roles can access (the `project_access` axis), so the list itself is access-scoped exactly as the prototype's switcher is — but enforced server-side.

`POST /api/projects` body:

```json
{
  "name": "E-12 Infrastructure Works, Islamabad",
  "pd_hq_id": "pd-centre",
  "client_name": "Capital Development Authority (CDA)",
  "design_consultant": "ACE-EA (JV)",
  "contract_ref": "NLC/ECC/2026/N-022",
  "contract_value": "8640000000.0000",
  "window_start": "2026-03-01",
  "window_end": "2028-08-17"
}
```

---

## 5. Commercial — IPC register (representative; RAR/EPC follow the same shape)

```
GET    /api/projects/{id}/ipcs            IPC register             gate: project×role (read)
GET    /api/ipcs/{ipcId}                  one IPC + lines + deductions
POST   /api/projects/{id}/ipcs            create draft IPC         gate: ipc.create + project×role
POST   /api/ipcs/{ipcId}/transitions      advance pipeline         gate: ipc.<action> + project×role
PATCH  /api/ipcs/{ipcId}/note             set sanitized note       gate: ipc.note
```

The IPC pipeline is a state machine; transitions are not arbitrary PATCHes. A transition request names the target action; the server validates the source→target edge against the pipeline (`draft → submitted → vetted → forwarded_to_client → approved → paid_pending_ack → paid`), checks the gate for that action, stamps the corresponding timestamp, writes audit, and returns the updated IPC. An illegal edge is `409 CONFLICT`; an out-of-permission action is `403`.

`POST /api/ipcs/{ipcId}/transitions` body:

```json
{ "action": "vet", "vetted_gross": "152300000.0000", "vetted_net_payable": "137070000.0000", "version": 3 }
```

`POST /api/projects/{id}/ipcs` body (draft):

```json
{ "period": "May-2026", "submission_date": "2026-06-01",
  "lines": [ { "boq_item_code": "I0042", "qty": "120.0000", "rate": "8500.0000" } ] }
```

The server computes `amount` per line via the BOQ item's `unit_divisor` (never trusting a client-sent amount), sums `gross`, computes deductions from `commercial_settings`, derives `net_payable` and `cum_gross`. **Server-authoritative arithmetic** is the rule for every money field — the client proposes inputs, the server computes outputs.

---

## 6. Command roll-ups (the dashboard data)

```
GET /api/nodes/{nodeId}/rollup            access-scoped KPI roll-up for a branch or project
GET /api/nodes/{nodeId}/scurve            weighted aggregate S-curve  [{month, planned, actual}]
GET /api/nodes/{nodeId}/cashflow          aggregated monthly cash flow
GET /api/nodes/{nodeId}/exceptions        red/amber projects under the node
GET /api/nodes/{nodeId}/league            cross-child league table
GET /api/nodes/{nodeId}/pipeline          IPC billing pipeline funnel
```

All six aggregate over the projects under `nodeId` that the caller may access — the access scope is applied **inside** the aggregation, so a roll-up never leaks totals from projects the caller can't see. These replace the prototype's in-browser `computeNodeRollup` family; the math (contract-value-weighted S-curve, money summed across projects, RAG thresholds) is ported verbatim and validated against the existing smoke-test assertions.

`GET /api/nodes/{nodeId}/rollup` response (abridged):

```json
{
  "node": { "id": "pd-north", "name": "HQ PD North", "type": "pd_hq" },
  "totals": { "contract_value": "...", "gross_revenue": "...", "vetted_revenue": "...",
              "receipts": "...", "net_receivable": "...", "cash_position": "..." },
  "rows": [ { "project_id": "proj-f14f15", "name": "F-14/15 Islamabad", "contract_value": "...", "..." : "..." } ]
}
```

---

## 7. Procurement & approval chains

```
GET    /api/projects/{id}/demands          demand register
POST   /api/projects/{id}/demands          raise demand            gate: proc.demand.raise
POST   /api/demands/{demandId}/advance     walk the approval chain  gate: resolved-stage-role + financial-power
POST   /api/pos                            issue PO from demand     gate: proc.po.issue
POST   /api/pos/{poId}/crvs                create CRV               gate: proc.crv.create (422 on cumulative over-receipt)
POST   /api/proc-payments                  raise procurement payment
POST   /api/proc-payments/{id}/advance     walk payment chain       gate: resolved-stage-role + financial-power
```

`advance` is the chain-walking primitive and it does **not** hardcode the next action. The server reads the document's `chain_type`, looks up the next stage in `approval_chain_stage`, resolves the role for that stage (`project_action_override` if present, else the global default, `admin` always retained), checks the caller holds that role, checks the caller's `financial_power` threshold covers the document value, records an `approval_event`, advances `current_stage`, and audits. This is the server-side form of the prototype's `advanceApprovalChain(docType, docId, action)`.

`POST /api/demands/{demandId}/advance` body:

```json
{ "action": "validate", "note": "Quantities verified against BOQ", "version": 1 }
```

The mid-chain divergence (material/machinery demands use `recommend → endorse → approve`; the shorter `machinery_demand` skips `endorse`; payment chains differ in length) is data in `approval_chain_stage`, not branching code — so the endpoint is uniform across all six chains.

---

## 8. Comments & audit

```
GET    /api/nodes/{nodeId}/comments        thread (newest first)
POST   /api/nodes/{nodeId}/comments        add comment (server-sanitized body)  gate: project×role / node visibility
DELETE /api/comments/{commentId}           delete own comment (or admin)
GET    /api/audit                          audit query (filter by action/ref/project/date)  gate: admin or scoped reviewer
```

Comment bodies are sanitized server-side on write (the prototype's `_sanitizeText` becomes a server function — defence that the client cannot skip) and HTML-escaped on render. The audit log is read-only over the API; there is no write or delete endpoint for it, mirroring the database-level immutability trigger.

---

## 9. Preferences (per-user, not shared)

```
GET  /api/me/prefs                         { theme, ragThresholds, filters, scurveHide, recentNodes }
PUT  /api/me/prefs                         replace the caller's preference document
```

RAG thresholds, filters, recent-nodes and theme are per-user and never affect another user's view — the multi-user fix for what the prototype stored in a single shared `state.ui`.

---

## 10. What the UI cutover looks like

Milestone M2 needs only §3. The app's `loadState()` becomes `GET /api/projects/{active}/state`; `saveState()` becomes a debounced `PUT` carrying the `version`. The Restore/Backup buttons become "export current server state to JSON" and "import a JSON backup" (the latter calling the one-time importer). Everything else in the single-file app keeps working unchanged. Per-entity endpoints (§4–§9) come online as screens are refactored, each one moving a slice of trust from the browser to the server without a visible change to the user.
