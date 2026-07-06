# Requirements v2 — Organisation, Workflows & Role Dashboards

Status: POLISHED SPEC — clarifications ANSWERED 2026-07-04 (§9); implementation under way per §8.
Source: user requirements document of 2026-07-04 ("Roles / Tasks / Dashboards"), polished and
logically enhanced. This file is the continuation package: a new session should read this,
`journal.txt`, and the gap matrix (§7) to resume.

---

## 1. Organisation model (four command levels)

### 1.1 Project level
- **Senior Project Manager (SPM)** — accountable head of project
  - **Deputy Project Manager (DPM)**
    - Planning Engineer · Contract Engineer · Senior Quantity Surveyor (SQS) ·
      Procurement Engineer · Store Incharge · Finance Manager (Proj) · Site Engineer

### 1.2 HQ PD level (Projects Directorate)
- **Projects Director (PD)**
  - **Deputy Projects Director (DPD)**
    - SM/Manager Plans · SM/Manager Contracts · SM/Manager Monitoring ·
      SM/Manager Procurement · SM/Manager Recovery · SM/Manager Finance ·
      Manager HR · **Pre-Audit** (audits all internal bills before PD approval) ·
      SPMs of all under-command projects

### 1.3 HQ Engineers level
- **Comd Engineers**
  - **Deputy Comd Engineers**
    - GM Ops & Monitoring → SM Monitoring → Manager → Assistant Manager
    - SM Plans → Manager → AM · SM Contracts → Manager → AM ·
      SM Procurement → Manager → AM · SM Recovery · SM Finance → Manager → AM · SM HR
  - Project Directors (all PD HQs)

### 1.4 HQ NLC level
- **DG NLC**
  - **COO Ops** → Dir Ops · Comd Engineers · Dir Plans · Dir Procurement (Dir Sp) ·
    Dir LAR (Legal, Audit & Recovery) · CFO · Dir HR

Enhancement (E1): each appointment binds to the unified user model (name + appointment +
scope node); deputies act as formal chain steps, not mere delegates, unless clarified otherwise.

## 2. Project genesis workflow
1. Comd Engrs **authorises** SM Plans (HQ Engrs) to create the project → project record created.
2. Project becomes visible to its HQ PD. SM Plans (HQ PD) enters **salients** per contract.
3. Manager HR (HQ PD) creates project **key-appointment HR** (SPM, DPM, Planning Engr, SQS,
   Procurement Engr, Store Incharge, FM, Site Engr…); full auth/held/deficient table may be
   uploaded later.
4. HR authorisation ladder: PD **recommends** → SM HR (HQ Engrs) **reviews** → Comd Engrs
   **endorses** → Dir HR (HQ NLC) **reviews** → DG NLC **approves**.
   Delegation (§9 A3): individual appointments Grade 1–16 terminate at **Comd Engrs**;
   Grade 17+ and the overall TOHR terminate at **DG NLC**.
5. Only after DG approval does the project level open to project staff.
   Enhancement (E2): each step supports "return for correction" with remarks; the ladder is a
   chain instance reusing the procurement-chain engine.

## 3. Baseline governance (validate → lock → authorised revision)
- **BOQ**: SQS imports → Planning Engr + DPM + SPM validate → Manager Plans (HQ PD) **locks**.
  Change only via Variation Order cycle (existing).
- **Schedule (XER)**: Planning Engr imports → DPM + SPM validate → SM/Manager Plans (HQ PD)
  locks. Revision only on **Comd Engrs authorisation**.
- **Mapping (BOQ↔WBS, BOQ↔Material)**: SQS maps → Planning Engr + Procurement Mgr + DPM + SPM
  validate → SM Procurement reviews → SM Plans (HQ PD) locks. Revision per Comd Engrs.
  Enhancement (E3): lock state banner + who/when + revision-request workflow on each register.

## 4. Contracts (distribution → award → freeze → P&L)
- Contract Engineer plans **distribution** of BOQ items (sublet vs self-execution) and drafts
  labour & sublet contracts; DPM + SPM validate.
- Value-routed approval (after SM/Manager Contracts review at each level, through proper channel):
  | Type   | ≤ ceiling → PD | mid-band → Comd Engrs | above → DG NLC |
  |--------|----------------|----------------------|----------------|
  | Labour | ≤ 15 Mn        | 15–30 Mn             | > 30 Mn        |
  | Sublet | ≤ 150 Mn       | 150–300 Mn           | > 300 Mn       |
- On approval the distributed item **quantities freeze**; remainder may be awarded to another
  contractor. Item-wise **contract P&L** (contract rates vs BOQ rates) is visible to the whole
  approval chain before and after award. Contracts register carries status.
  Enhancement (E4): freeze is enforced at the distribution planner; attempted double-award of a
  frozen quantity is blocked with an audit trail.

## 5. Billing, recovery & payments
- **IPC (client)**: SQS updates executed qtys weekly → generates IPC → DPM endorses → SPM marks
  Submitted → Vetted → Approved (client paid) → FM (HQ PD) marks **Cheque Received** → receipt
  booked. Identical flow for EPC receivables.
- **RAR (contractor)**: SQS generates with **material recovery** (issued & consumed) and
  **machinery recovery** (NLC plant used) → Contract Engr reviews → DPM + SPM endorse →
  Manager Contracts (HQ PD) reviews → **Pre-Audit audits** → PD approves through DPD →
  SM/Manager Finance pays & issues cheque → payment booked. Same for EPC subcontractors.
- Principle: sublet contractors procure their own material; NLC-issued material/machinery is
  always recovered via RAR — over-procurement beyond self-execution issued to contractors MUST
  be recovered (no irregular outflow).

## 6. Procurement, machinery & plant
- **Central materials (Cement, Steel, Bitumen)**: Procurement Incharge demands → SQS verifies vs
  execution plan → SM Proc (HQ PD) review → PD recommends via DPD → SM Proc (HQ Engrs) review →
  **Dir Sp (HQ NLC) approves** via Dy Comd + Comd Engrs → HQ PD issues PO(s) → CRVs at site →
  **supplier bill generated from CRVs against POs** → Procurement Engr generates, SPM verifies →
  SM Proc (HQ PD) review → Pre-Audit → via SM Finance/DPD/PD to Comd Engrs → SM Proc (HQ Engrs)
  review → **CFO pays** via Dy Comd/Comd/Dir Sp. Local purchase of central materials needs Dir Sp
  permission for a specific quantity.
- **Local materials (crush, sand, bricks…)**: same pattern but the chain terminates at **PD
  approval** and **SM Finance (HQ PD) pays**.
- **Machinery transfer**: SM Proc (HQ PD) transfers integral machinery/plant/vehicles between
  projects, locked & booked to project, technically justified against BOQ quantities; approval
  DPD → PD → SM Proc (HQ Engrs).
- **Hiring**: demand raised by SM Proc (HQ PD), verified by SM Plans, approved by **Comd Engrs**;
  booked for hire duration, self-execution only, justified vs BOQ quantities.
- **Batching/asphalt plants**: transferred plant may produce concrete/asphalt of different
  **grades with mix designs**; constituent materials (cement, sand, crush, bitumen) are issued
  to the plant with consumption & balance recorded; output goes to self-execution or is issued
  to contractors and recovered via RAR.
- **Running logs & POL** per machine daily; costs computed.
- **Cost heads**: vehicles, office generators and their maintenance → **Overheads sub-heads**;
  HR, camp establishment, utilities → Overheads; all else to proper Direct-Cost heads. All HQ PD
  payments release only after Pre-Audit, through proper channel.

## 7. Gap matrix (app as built, 2026-07-04, 401 web tests)
| Area | Status | Note |
|---|---|---|
| Unified user model + org scoping | ✅ | appointments granularity missing (9 roles vs ~40 appointments) |
| Financial powers | ◐ | single-dimension powers; need labour/sublet two-band ceilings 15/30 & 150/300 Mn |
| Pre-Audit step in chains | ✖ | absent from RAR/supplier-bill chains |
| Project creation authorisation + HR approval ladder | ✖ | projects created directly today |
| Salients entry | ✅ | exists |
| BOQ lock + VO cycle | ✅ | validate-ladder before lock is implicit, not stepped |
| XER import + schedule | ✅ | lock/revision authorisation ✖ |
| Mapping (many-to-many, compositions, coverage, review) | ✅ | lock ladder ✖ |
| Distribution planner | ✅ | freeze-on-approval ◐ needs enforcement check |
| Contract value routing | ◐ | chains exist; three-band type-specific routing ✖ |
| Contract item-wise P&L in chain | ◐ | margin analytics exists; per-approval-step visibility ✖ |
| IPC ladder incl. vetted/paid/cheque | ✅ | naming aligns closely |
| RAR + material & machinery recovery | ✅ | Pre-Audit ✖ |
| Central vs local procurement chains | ◐ | chain types exist; Dir Sp/CFO top steps ✖ |
| Supplier bill from CRVs vs POs | ◐ | payments exist; formal bill-from-CRV doc ✖ |
| Machinery register, hiring, utilisation logs, POL | ✅ | inter-project transfer+lock ✖ |
| Plant production runs | ✅ | mix-design grades + constituent issue-to-plant ◐ (compositions exist) |
| Overhead sub-heads auto-booking | ◐ | HR auto-books; vehicles/maintenance linkage ✖ |
| Section dashboards (Monitoring/Planning/Proc/Fin/Contracts) | ✅ | Recovery & HR sections ✖; per-section map & alerts sub-tab ✖ |
| Directives downward | ✅ | "Mark Input" upward (formal noting to superior) ✖ |
| Recovery of phy-completed projects | ✅ | lifecycle + Recovery register + DLP + final bill |
| Custom executive dashboards | ◐ | per-role metric prefs exist; per-appointment presets ✖ |
| Map with per-project navigation | ✅ | embedding a map pane inside each section dashboard ✖ |

## 8. Phased implementation plan
1. **Appointment model**: catalogue (done — `domain/appointments.ts`), map to users, per-level
   chain engine with "through proper channel" + return-for-correction.
2. **Two-band contract powers** (labour 15/30, sublet 150/300) + value routing + Pre-Audit step.
3. **Project genesis**: creation authorisation, HR ladder, visibility gates.
4. **Baseline locks**: BOQ/XER/mapping validate→lock ladders + revision authorisation.
5. **Distribution freeze enforcement + contract P&L in chain.**
6. **Procurement top-of-chain** (Dir Sp/CFO), bill-from-CRV document, machinery transfer, plant
   mix designs.
7. **Dashboards**: Recovery + HR sections, per-section map + alerts, Mark-Input upward,
   executive presets.

## 9. Clarifications — ANSWERED (2026-07-04)
1. **Individual logins for ALL appointments.** SM / Manager / AM are distinct chain steps.
2. **Intermediates formally act in-app on every file** (DPD, Dy Comd, COO are real steps).
3. **HR approval delegation by grade**: Grade 17 and above → DG NLC approves; Grades 1–16 →
   Comd Engineers approves. The overall TO/HR table (TOHR) is approved by DG NLC.
4. **Ceilings apply per contract**; contract variations re-route approval at the REVISED value.
5. **Pre-Audit sits at HQ PD only.** Every chain step supports "returned for correction".
6. **Mix-design library confirmed**: standard grades (C15/C20/C30; AC base/wearing) with
   editable constituent coefficients.
7. **EPC subcontractors: byte-identical RAR chain including Pre-Audit.**
8. **Legacy mapping CONFIRMED**: pm→SPM, qs→SQS, fm→SM Finance (HQ PD), pd→PD,
   manager_contracts→SM/Manager Contracts (HQ PD), surveyor→Site Engineer, admin→DG.
9. **Mark-Input**: a recorded minute travelling up the proper channel; the superior MUST
   acknowledge (acknowledgement is tracked and appears in the superior's work-list).
