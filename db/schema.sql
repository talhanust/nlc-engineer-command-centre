-- =====================================================================
-- FGEHA × NLC Unified Project Control — PostgreSQL Schema (v1)
-- Target: PostgreSQL 15+
-- Derived from the v1.43.0 single-file app `state` shape.
--
-- Conventions
--   * Money:        NUMERIC(20,4), PKR. Never FLOAT (the app sums money
--                   across projects — exact decimal arithmetic required).
--   * Percentages:  NUMERIC(7,4) (0..100, room for weighted curves).
--   * Surrogate PK: BIGINT GENERATED ALWAYS AS IDENTITY everywhere, EXCEPT
--                   org_node + role + permission, which keep the app's
--                   stable string keys (hq-nlc, pd-north, qs, proc.demand.raise…).
--   * Timestamps:   TIMESTAMPTZ, default now(). created_at/updated_at on
--                   every mutable table.
--   * Soft delete:  archived BOOLEAN where the app supports archive/restore.
--   * Tenancy:      single organisation (FGEHA×NLC). The org tree is the
--                   scoping boundary for RBAC, not a tenant_id column.
-- =====================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS fnpc;
SET search_path TO fnpc, public;

-- ---------------------------------------------------------------------
-- 0. ENUMS  (mirror the app's frozen constant maps)
-- ---------------------------------------------------------------------
CREATE TYPE node_type        AS ENUM ('hq', 'hq_engrs', 'pd_hq', 'project');
CREATE TYPE ipc_status       AS ENUM ('draft','submitted','vetted','forwarded_to_client',
                                      'approved','paid_pending_ack','paid');
CREATE TYPE rar_status       AS ENUM ('draft','submitted','verified','approved',
                                      'marked_payment','paid');
CREATE TYPE demand_type      AS ENUM ('material','machinery','machinery_hire');
CREATE TYPE material_flow    AS ENUM ('self_use','sublet_issue','batching_plant');
CREATE TYPE chain_type       AS ENUM ('proc_demand_material','proc_demand_machinery',
                                      'machinery_demand','proc_payment_material',
                                      'proc_payment_machinery','machinery_payment');
CREATE TYPE rate_basis       AS ENUM ('per_day','per_hour','lumpsum');
CREATE TYPE supplier_kind    AS ENUM ('material','machinery','both');
CREATE TYPE theme_pref       AS ENUM ('auto','light','dark');

-- ---------------------------------------------------------------------
-- 1. IDENTITY & RBAC
--    Replaces the client-side `state.session.role` toggle and the
--    advisory `project.access` membership with server-enforced auth.
-- ---------------------------------------------------------------------

-- Users come from AD/SSO (OIDC/SAML). We keep a local mirror keyed by the
-- IdP subject so audit rows and assignments survive directory churn.
CREATE TABLE app_user (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    idp_subject   TEXT        NOT NULL UNIQUE,          -- OIDC `sub` / SAML NameID
    username      TEXT        NOT NULL UNIQUE,
    display_name  TEXT        NOT NULL,
    email         TEXT,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

-- The 14 app roles (qs, pm, preaudit, pd, ce, dg, fm, fh, planner,
-- storeKeeper, pic, comd_engrs, dir_sp, admin). String PK == app role key.
CREATE TABLE role (
    key          TEXT PRIMARY KEY,            -- 'qs', 'pm', 'admin', …
    label        TEXT NOT NULL,               -- 'Quantity Surveyor'
    home_module  TEXT NOT NULL,               -- 'commercial' | 'executive' | … | 'all'
    is_admin     BOOLEAN NOT NULL DEFAULT FALSE
);

-- The ~79 permission keys (proc.demand.raise, ipc.vet, machinery.pay, …).
CREATE TABLE permission (
    key       TEXT PRIMARY KEY,               -- 'proc.demand.raise'
    category  TEXT NOT NULL                   -- 'proc' | 'ipc' | 'rar' | …
);

-- Global default action→role grants (the app's PERMISSIONS map).
CREATE TABLE role_permission (
    role_key       TEXT NOT NULL REFERENCES role(key) ON DELETE CASCADE,
    permission_key TEXT NOT NULL REFERENCES permission(key) ON DELETE CASCADE,
    PRIMARY KEY (role_key, permission_key)
);

-- Org tree node (defined here because user_role FKs to it). Adjacency list:
-- HQ NLC → HQ Engrs → 5 PD HQs → projects.
CREATE TABLE org_node (
    id          TEXT PRIMARY KEY,                       -- 'hq-nlc','pd-north','proj-f14f15'
    name        TEXT      NOT NULL,
    node_type   node_type NOT NULL,
    parent_id   TEXT REFERENCES org_node(id),           -- NULL only for root 'hq-nlc'
    sort_order  INTEGER   NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_org_node_parent ON org_node(parent_id);

-- A user holds one or more roles, OPTIONALLY scoped to an org node so the
-- NLC hierarchy (HQ-level / PD-level / Project-level) is expressible:
-- a PD-North PM gets `pm` scoped to node 'pd-north'; NULL scope == global.
CREATE TABLE user_role (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    role_key    TEXT   NOT NULL REFERENCES role(key),
    scope_node  TEXT   REFERENCES org_node(id),         -- NULL == org-wide
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by  BIGINT REFERENCES app_user(id),
    UNIQUE (user_id, role_key, scope_node)
);

-- ---------------------------------------------------------------------
-- 2. ORG TREE  (state.org.tree)
--    Adjacency-list tree: HQ NLC → HQ Engrs → 5 PD HQs → projects.
--    (org_node itself is created in section 1 — user_role FKs to it.)
--    The fixed 3-level shape is enforced by app/service rules, not a CHECK.
-- ---------------------------------------------------------------------

-- Per-project access membership (replaces project.access.roles, advisory →
-- enforced). A row == "this role may access this project". admin bypasses.
CREATE TABLE project_access (
    project_id  TEXT NOT NULL REFERENCES org_node(id) ON DELETE CASCADE,
    role_key    TEXT NOT NULL REFERENCES role(key),
    PRIMARY KEY (project_id, role_key)
);

-- ---------------------------------------------------------------------
-- 3. PROJECT  (state.org.projects[id] minus its working-set `data`)
--    The single-file app kept the ACTIVE project's data in top-level
--    slices and inactive projects' data in node.data (the "working-set +
--    stash" trick). On the server that distinction disappears: ALL
--    project data is normalised into the tables below, always addressable.
-- ---------------------------------------------------------------------
CREATE TABLE project (
    id               TEXT PRIMARY KEY REFERENCES org_node(id) ON DELETE CASCADE,
    pd_hq_id         TEXT NOT NULL REFERENCES org_node(id),
    full_name        TEXT,
    archived         BOOLEAN NOT NULL DEFAULT FALSE,
    is_demo          BOOLEAN NOT NULL DEFAULT FALSE,
    -- Client salients (project.client.*)
    client_name      TEXT,
    design_consultant TEXT,
    contractor_name  TEXT,
    contract_ref     TEXT,
    contract_value   NUMERIC(20,4) NOT NULL DEFAULT 0,
    window_start     DATE,
    window_end       DATE,
    duration_days    INTEGER,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_project_pd_hq ON project(pd_hq_id);
CREATE INDEX ix_project_live  ON project(archived) WHERE archived = FALSE;

-- Per-project per-action approval-chain role override (project.approvalChain).
-- Sparse: a row only exists where a project overrides the global default.
CREATE TABLE project_action_override (
    project_id   TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    action_key   TEXT NOT NULL,                         -- e.g. 'ipc.vet'
    role_keys    TEXT[] NOT NULL,                       -- ordered roles allowed
    PRIMARY KEY (project_id, action_key)
);

-- ---------------------------------------------------------------------
-- 4. BOQ  (project.boq → bills + items, 12 bills / 434 items for F-14/15)
-- ---------------------------------------------------------------------
CREATE TABLE boq_bill (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    bill_no     TEXT NOT NULL,
    bill_name   TEXT,
    UNIQUE (project_id, bill_no)
);

CREATE TABLE boq_item (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    bill_id      BIGINT REFERENCES boq_bill(id) ON DELETE SET NULL,
    item_code    TEXT,                                  -- app code like 'I0042'
    sr_no        TEXT,
    description  TEXT,
    section      TEXT,
    unit         TEXT,
    unit_divisor INTEGER NOT NULL DEFAULT 1,            -- 1/100/1000
    quantity     NUMERIC(20,4) NOT NULL DEFAULT 0,
    rate         NUMERIC(20,4) NOT NULL DEFAULT 0,
    amount       NUMERIC(20,4) NOT NULL DEFAULT 0,      -- derived qty*rate/divisor
    UNIQUE (project_id, item_code)
);
CREATE INDEX ix_boq_item_project ON boq_item(project_id);
CREATE INDEX ix_boq_item_bill    ON boq_item(bill_id);

-- ---------------------------------------------------------------------
-- 5. BASELINES  (project.scurve, project.schedule)
-- ---------------------------------------------------------------------
CREATE TABLE scurve_point (
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    month_key   TEXT NOT NULL,                          -- 'Mon-YY' as authored
    planned_pct NUMERIC(7,4) NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, month_key)
);

CREATE TABLE schedule_activity (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    activity_id  TEXT NOT NULL,                         -- app id 'A0001'
    name         TEXT,
    wbs          TEXT,
    parent_id    TEXT,                                  -- self-ref by activity_id
    duration_days INTEGER,
    planned_start DATE,
    planned_finish DATE,
    is_milestone BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (project_id, activity_id)
);

-- ---------------------------------------------------------------------
-- 6. COMMERCIAL  (state.commercial.*)
-- ---------------------------------------------------------------------
CREATE TABLE subcontractor (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    app_sub_id  TEXT NOT NULL,                          -- in-app id reused by RARs
    name        TEXT NOT NULL,
    sub_type    TEXT,
    UNIQUE (project_id, app_sub_id)
);

CREATE TABLE ipc (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    ipc_no          TEXT NOT NULL,                       -- 'IPC-01'
    seq             INTEGER NOT NULL,
    period          TEXT,
    status          ipc_status NOT NULL DEFAULT 'draft',
    gross           NUMERIC(20,4) NOT NULL DEFAULT 0,
    deductions_json JSONB NOT NULL DEFAULT '{}',         -- retention/tax/advance breakdown
    net_payable     NUMERIC(20,4) NOT NULL DEFAULT 0,
    cum_gross       NUMERIC(20,4) NOT NULL DEFAULT 0,
    vetted_gross        NUMERIC(20,4),
    vetted_net_payable  NUMERIC(20,4),
    paid_amount         NUMERIC(20,4),
    note            TEXT,                                -- sanitized free text
    is_final        BOOLEAN NOT NULL DEFAULT FALSE,
    submission_date DATE,
    -- pipeline timestamps
    drafted_at      TIMESTAMPTZ,
    submitted_at    TIMESTAMPTZ,
    vetted_at       TIMESTAMPTZ,
    forwarded_to_client_at TIMESTAMPTZ,
    client_approved_at TIMESTAMPTZ,
    receipt_ack_at  TIMESTAMPTZ,
    paid_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, ipc_no)
);
CREATE INDEX ix_ipc_project_status ON ipc(project_id, status);
CREATE INDEX ix_ipc_paid_at        ON ipc(paid_at) WHERE paid_at IS NOT NULL;

CREATE TABLE ipc_line (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ipc_id    BIGINT NOT NULL REFERENCES ipc(id) ON DELETE CASCADE,
    boq_item_id BIGINT REFERENCES boq_item(id),
    qty       NUMERIC(20,4) NOT NULL DEFAULT 0,
    rate      NUMERIC(20,4) NOT NULL DEFAULT 0,
    amount    NUMERIC(20,4) NOT NULL DEFAULT 0
);
CREATE INDEX ix_ipc_line_ipc ON ipc_line(ipc_id);

CREATE TABLE rar (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    rar_no        TEXT NOT NULL,
    seq           INTEGER NOT NULL,
    subcontractor_id BIGINT REFERENCES subcontractor(id),
    status        rar_status NOT NULL DEFAULT 'draft',
    gross         NUMERIC(20,4) NOT NULL DEFAULT 0,
    net_payable   NUMERIC(20,4) NOT NULL DEFAULT 0,
    paid_amount   NUMERIC(20,4),
    period        TEXT,
    selections_json JSONB NOT NULL DEFAULT '{}',         -- keyed by ALLOCATION id (pitfall 4.2)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, rar_no)
);
CREATE INDEX ix_rar_project_status ON rar(project_id, status);

-- IPC↔RAR recovery links (state.commercial.rarToIpcLinks)
CREATE TABLE rar_ipc_link (
    rar_id  BIGINT NOT NULL REFERENCES rar(id) ON DELETE CASCADE,
    ipc_id  BIGINT NOT NULL REFERENCES ipc(id) ON DELETE CASCADE,
    amount  NUMERIC(20,4) NOT NULL DEFAULT 0,
    PRIMARY KEY (rar_id, ipc_id)
);

-- Escalation Price Certificates (state.commercial.escalation.epcs)
CREATE TABLE epc (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    epc_no      TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    status      ipc_status NOT NULL DEFAULT 'draft',     -- shares the IPC pipeline
    amount      NUMERIC(20,4) NOT NULL DEFAULT 0,
    indices_json JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, epc_no)
);

-- Item distributions / allocations (state.commercial.distributions[itemId])
CREATE TABLE distribution (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    boq_item_id  BIGINT NOT NULL REFERENCES boq_item(id) ON DELETE CASCADE,
    mode         TEXT NOT NULL DEFAULT 'unassigned'      -- self|sublet|labour|unassigned
);
CREATE TABLE allocation (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    distribution_id BIGINT NOT NULL REFERENCES distribution(id) ON DELETE CASCADE,
    subcontractor_id BIGINT REFERENCES subcontractor(id),
    allocated_qty   NUMERIC(20,4) NOT NULL DEFAULT 0,
    executed_qty    NUMERIC(20,4) NOT NULL DEFAULT 0
);

-- Mobilisation / secure advances (clientReceipts + subDisbursements)
CREATE TABLE advance (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,                           -- 'mob' | 'secure'
    direction   TEXT NOT NULL,                           -- 'client_receipt' | 'sub_disbursement'
    subcontractor_id BIGINT REFERENCES subcontractor(id),
    amount      NUMERIC(20,4) NOT NULL DEFAULT 0,
    dated       DATE,
    note        TEXT
);

-- Per-project commercial settings (state.commercial.settings: retention/tax/
-- aging/escalation factors/finalBill/reconciliation/cashFlow). Low-churn,
-- kept as one JSONB document per project rather than 30 scalar columns.
CREATE TABLE commercial_settings (
    project_id  TEXT PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
    settings    JSONB NOT NULL DEFAULT '{}'
);

-- ---------------------------------------------------------------------
-- 7. FINANCIAL  (state.financial.*)
-- ---------------------------------------------------------------------
CREATE TABLE financial_receipt (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    source_type TEXT,                                    -- 'ipc' | 'advance' | 'manual'
    source_ref  TEXT,                                    -- e.g. ipc_no
    amount      NUMERIC(20,4) NOT NULL DEFAULT 0,
    paid_at     DATE NOT NULL,                           -- cash-flow bucket key (by month)
    note        TEXT
);
CREATE INDEX ix_receipt_project_month ON financial_receipt(project_id, paid_at);

CREATE TABLE financial_payment (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    category    TEXT,                                    -- 'direct.materials' | 'overhead' | …
    source_type TEXT,
    source_ref  TEXT,
    amount      NUMERIC(20,4) NOT NULL DEFAULT 0,
    paid_at     DATE NOT NULL,
    note        TEXT
);
CREATE INDEX ix_payment_project_month ON financial_payment(project_id, paid_at);

CREATE TABLE financial_liability (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    kind        TEXT,                                    -- 'rar_outstanding' | 'retention_held'
    source_ref  TEXT,
    amount      NUMERIC(20,4) NOT NULL DEFAULT 0,
    as_of       DATE
);

CREATE TABLE planned_overhead (
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    month_key   TEXT NOT NULL,                           -- 'Mon-YY'
    amount      NUMERIC(20,4) NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, month_key)
);

-- ---------------------------------------------------------------------
-- 8. EXECUTION  (state.execution.*)
-- ---------------------------------------------------------------------
-- Monthly physical progress per activity (state.execution.monthly).
CREATE TABLE execution_monthly (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    activity_id  TEXT,                                   -- matches schedule_activity.activity_id
    month_key    TEXT NOT NULL,
    actual_pct   NUMERIC(7,4) NOT NULL DEFAULT 0,
    UNIQUE (project_id, activity_id, month_key)
);
CREATE INDEX ix_exec_monthly_project ON execution_monthly(project_id, month_key);

-- Resource ledgers: store / plant / equipment. One table, resource_class
-- discriminator, since the three share shape (state.execution.store/plant/
-- equipment + their *Monthly/*Daily variants).
CREATE TABLE execution_resource (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id     TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    resource_class TEXT NOT NULL,                        -- 'store' | 'plant' | 'equipment'
    app_ref        TEXT,
    name           TEXT,
    unit           TEXT,
    period_key     TEXT,                                 -- month or day bucket
    qty            NUMERIC(20,4) NOT NULL DEFAULT 0,
    detail_json    JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX ix_exec_resource ON execution_resource(project_id, resource_class, period_key);

-- ---------------------------------------------------------------------
-- 9. MAPPING  (state.mapping.*)
-- ---------------------------------------------------------------------
CREATE TABLE boq_to_wbs (
    boq_item_id  BIGINT NOT NULL REFERENCES boq_item(id) ON DELETE CASCADE,
    activity_id  TEXT   NOT NULL,                        -- schedule_activity.activity_id
    weight       NUMERIC(7,4) NOT NULL DEFAULT 100,
    confidence   TEXT NOT NULL DEFAULT 'confirmed',      -- confirmed|auto|disputed
    PRIMARY KEY (boq_item_id, activity_id)
);

CREATE TABLE boq_to_material (
    boq_item_id  BIGINT NOT NULL REFERENCES boq_item(id) ON DELETE CASCADE,
    material_ref TEXT NOT NULL,
    coeff        NUMERIC(20,6) NOT NULL DEFAULT 0,       -- consumption per unit
    confidence   TEXT NOT NULL DEFAULT 'confirmed',
    PRIMARY KEY (boq_item_id, material_ref)
);

-- ---------------------------------------------------------------------
-- 10. PROCUREMENT  (state.procurement.*)
-- ---------------------------------------------------------------------
CREATE TABLE supplier (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  TEXT REFERENCES project(id) ON DELETE CASCADE, -- NULL == org-wide vendor
    app_ref     TEXT,                                    -- 'sup-3'
    name        TEXT NOT NULL,
    kind        supplier_kind NOT NULL DEFAULT 'material',
    detail_json JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE demand (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    demand_no       TEXT NOT NULL,                       -- 'DEM-0001'
    seq             INTEGER NOT NULL,
    type            demand_type NOT NULL,
    flow            material_flow,                       -- only for material demands
    justification   TEXT,
    required_by     DATE,
    supplier_hint   TEXT,
    attachments_json JSONB NOT NULL DEFAULT '[]',
    total_estimated NUMERIC(20,4) NOT NULL DEFAULT 0,
    chain_type      chain_type NOT NULL,
    current_stage   INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, demand_no)
);
CREATE INDEX ix_demand_project ON demand(project_id);

CREATE TABLE demand_item (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    demand_id     BIGINT NOT NULL REFERENCES demand(id) ON DELETE CASCADE,
    boq_item_id   BIGINT REFERENCES boq_item(id),        -- optional link (v1.2.3)
    code          TEXT,
    description   TEXT,
    unit          TEXT,
    qty           NUMERIC(20,4) NOT NULL DEFAULT 0,
    estimated_rate NUMERIC(20,4) NOT NULL DEFAULT 0
);

CREATE TABLE purchase_order (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    po_no       TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    demand_id   BIGINT REFERENCES demand(id),
    supplier_id BIGINT REFERENCES supplier(id),
    status      TEXT NOT NULL DEFAULT 'open',            -- open|closed
    total_value NUMERIC(20,4) NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, po_no)
);

CREATE TABLE crv (                                       -- Certified Receipt Voucher
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    crv_no      TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    po_id       BIGINT REFERENCES purchase_order(id),
    received_json JSONB NOT NULL DEFAULT '[]',           -- [{code, qtyReceived}]
    over_receipt_flag BOOLEAN NOT NULL DEFAULT FALSE,    -- cumulative check (B-009)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, crv_no)
);

CREATE TABLE proc_payment (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    payment_no  TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    ref_type    TEXT,                                    -- 'po' | 'hire'
    ref_id      BIGINT,
    amount      NUMERIC(20,4) NOT NULL DEFAULT 0,
    chain_type  chain_type NOT NULL,
    current_stage INTEGER NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, payment_no)
);

CREATE TABLE machinery_hire (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    hire_no     TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    supplier_id BIGINT REFERENCES supplier(id),
    rate_basis  rate_basis NOT NULL,
    rate        NUMERIC(20,4) NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, hire_no)
);
CREATE TABLE machinery_utilization (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    hire_id   BIGINT NOT NULL REFERENCES machinery_hire(id) ON DELETE CASCADE,
    dated     DATE NOT NULL,
    units     NUMERIC(20,4) NOT NULL DEFAULT 0,          -- days|hours per basis
    note      TEXT
);

CREATE TABLE material_issue (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    issue_no    TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    flow        material_flow NOT NULL,
    subcontractor_id BIGINT REFERENCES subcontractor(id),
    detail_json JSONB NOT NULL DEFAULT '{}',
    issued_at   DATE,
    UNIQUE (project_id, issue_no)
);

CREATE TABLE production_run (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    run_no      TEXT NOT NULL,
    seq         INTEGER NOT NULL,
    detail_json JSONB NOT NULL DEFAULT '{}',
    ran_at      DATE,
    UNIQUE (project_id, run_no)
);

-- Admin-editable financial-power thresholds (state.procurement.financialPowers).
-- One row per role; NULL amount == unlimited (dg).
CREATE TABLE financial_power (
    role_key   TEXT PRIMARY KEY REFERENCES role(key),
    threshold  NUMERIC(20,4),                            -- NULL == unlimited
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by BIGINT REFERENCES app_user(id)
);

-- ---------------------------------------------------------------------
-- 11. APPROVAL CHAINS  (APPROVAL_CHAINS constant + live doc stage history)
-- ---------------------------------------------------------------------
-- Definition of each chain's ordered stages (seeded from APPROVAL_CHAINS).
CREATE TABLE approval_chain_stage (
    chain_type    chain_type NOT NULL,
    stage_index   INTEGER    NOT NULL,                   -- 1-based
    stage_name    TEXT NOT NULL,
    role_key      TEXT NOT NULL REFERENCES role(key),
    action        TEXT NOT NULL,
    days_expected INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (chain_type, stage_index)
);

-- Per-document stage transition history (doc.stageHistory). Polymorphic ref
-- by (doc_type, doc_id) — covers demand / proc_payment / machinery_hire.
CREATE TABLE approval_event (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    doc_type    TEXT NOT NULL,                           -- 'demand'|'proc_payment'|'hire'
    doc_id      BIGINT NOT NULL,
    stage_index INTEGER NOT NULL,
    action      TEXT NOT NULL,
    actor_id    BIGINT REFERENCES app_user(id),
    acted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    note        TEXT
);
CREATE INDEX ix_approval_event_doc ON approval_event(doc_type, doc_id);

-- ---------------------------------------------------------------------
-- 12. COMMENTS  (state.comments[nodeId])  — node-agnostic threads
-- ---------------------------------------------------------------------
CREATE TABLE node_comment (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    node_id    TEXT NOT NULL REFERENCES org_node(id) ON DELETE CASCADE,
    author_id  BIGINT REFERENCES app_user(id),
    body       TEXT NOT NULL,                            -- server-sanitized
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_node_comment_node ON node_comment(node_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 13. AUDIT LOG  (state.auditLog)  — APPEND-ONLY, immutable
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ts        TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_id  BIGINT REFERENCES app_user(id),
    role_key  TEXT,
    module    TEXT,
    action    TEXT NOT NULL,
    ref_type  TEXT,
    ref_id    TEXT,
    project_id TEXT REFERENCES org_node(id),
    before    JSONB,
    after     JSONB,
    notes     TEXT
);
CREATE INDEX ix_audit_action  ON audit_log(action);
CREATE INDEX ix_audit_ref     ON audit_log(ref_type, ref_id);
CREATE INDEX ix_audit_project ON audit_log(project_id, ts DESC);

-- Enforce immutability at the DB layer (no UPDATE/DELETE on audit rows).
CREATE OR REPLACE FUNCTION fnpc_block_audit_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only (% blocked)', TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION fnpc_block_audit_mutation();

-- ---------------------------------------------------------------------
-- 14. USER PREFERENCES  (state.ui.* that is genuinely per-user, not shared)
--     ragThresholds / filters / scurveHide / recentNodes / theme.
--     One JSONB doc per user keeps the UI layer free to evolve its shape.
-- ---------------------------------------------------------------------
CREATE TABLE user_pref (
    user_id    BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
    theme      theme_pref NOT NULL DEFAULT 'auto',
    prefs      JSONB NOT NULL DEFAULT '{}',              -- ragThresholds, filters, scurveHide, recentNodes
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;

-- =====================================================================
-- SEED — reference data that mirrors the app's frozen constants.
-- (Roles, the org tree skeleton, chain definitions, financial powers.)
-- =====================================================================
BEGIN;
SET search_path TO fnpc, public;

INSERT INTO role (key, label, home_module, is_admin) VALUES
 ('qs','Quantity Surveyor','commercial',false),
 ('pm','Project Manager','commercial',false),
 ('preaudit','Pre-Audit','commercial',false),
 ('pd','Project Director','executive',false),
 ('ce','Chief Engineer','executive',false),
 ('dg','Director General','executive',false),
 ('fm','Finance Manager','commercial',false),
 ('fh','Finance Head','commercial',false),
 ('planner','Planning Engineer','execution',false),
 ('storeKeeper','Store Keeper','execution',false),
 ('pic','Procurement In-charge','procurement',false),
 ('comd_engrs','Command Engineers','procurement',false),
 ('dir_sp','Director Supply','procurement',false),
 ('admin','System Administrator','all',true);

INSERT INTO org_node (id, name, node_type, parent_id, sort_order) VALUES
 ('hq-nlc','HQ NLC','hq',NULL,0),
 ('hq-engrs','HQ Engrs','hq_engrs','hq-nlc',0),
 ('pd-north','HQ PD North','pd_hq','hq-engrs',0),
 ('pd-centre','HQ PD Centre','pd_hq','hq-engrs',1),
 ('pd-kpk','HQ PD KPK','pd_hq','hq-engrs',2),
 ('pd-sindh','HQ PD Sindh','pd_hq','hq-engrs',3),
 ('pd-bln','HQ PD Bln','pd_hq','hq-engrs',4);

INSERT INTO financial_power (role_key, threshold) VALUES
 ('pm',1000000),('pd',25000000),('comd_engrs',100000000),
 ('dir_sp',500000000),('dg',NULL);

-- Approval-chain stage definitions (from APPROVAL_CHAINS).
INSERT INTO approval_chain_stage (chain_type, stage_index, stage_name, role_key, action, days_expected) VALUES
 ('proc_demand_material',1,'initiated','pic','raise',0),
 ('proc_demand_material',2,'validated','pm','validate',2),
 ('proc_demand_material',3,'recommended','pd','recommend',3),
 ('proc_demand_material',4,'endorsed','comd_engrs','endorse',5),
 ('proc_demand_material',5,'approved','dir_sp','approve',7),
 ('proc_demand_machinery',1,'initiated','pic','raise',0),
 ('proc_demand_machinery',2,'validated','pm','validate',2),
 ('proc_demand_machinery',3,'recommended','pd','recommend',3),
 ('proc_demand_machinery',4,'endorsed','comd_engrs','endorse',5),
 ('proc_demand_machinery',5,'approved','dir_sp','approve',7),
 ('machinery_demand',1,'initiated','pic','raise',0),
 ('machinery_demand',2,'validated','pm','validate',2),
 ('machinery_demand',3,'recommended','pd','recommend',3),
 ('machinery_demand',4,'approved','comd_engrs','approve',5),
 ('proc_payment_material',1,'raised','pic','raise',0),
 ('proc_payment_material',2,'preaudited','preaudit','preaudit',2),
 ('proc_payment_material',3,'validated','pm','validate',2),
 ('proc_payment_material',4,'approved_pd','pd','approve_pd',3),
 ('proc_payment_material',5,'approved_ce','comd_engrs','approve_ce',5),
 ('proc_payment_material',6,'approved_ds','dir_sp','approve_ds',7),
 ('proc_payment_material',7,'approved_dg','dg','approve_dg',10),
 ('proc_payment_material',8,'paid','fm','pay',14),
 ('proc_payment_material',9,'recorded','fh','record',15),
 ('proc_payment_machinery',1,'raised','pic','raise',0),
 ('proc_payment_machinery',2,'preaudited','preaudit','preaudit',2),
 ('proc_payment_machinery',3,'validated','pm','validate',2),
 ('proc_payment_machinery',4,'approved_pd','pd','approve_pd',3),
 ('proc_payment_machinery',5,'paid','fm','pay',7),
 ('proc_payment_machinery',6,'recorded','fh','record',8),
 ('machinery_payment',1,'raised','pic','raise',0),
 ('machinery_payment',2,'preaudited','preaudit','preaudit',2),
 ('machinery_payment',3,'validated','pm','validate',2),
 ('machinery_payment',4,'approved_pd','pd','approve_pd',3),
 ('machinery_payment',5,'paid','fm','pay',7);

COMMIT;
-- End of schema.
