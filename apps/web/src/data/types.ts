// The data layer is abstracted behind one interface so the SAME React app
import type { BaselineWorkflowState } from '../domain/schedulebaseline';
import type { BoqWorkflowState } from '../domain/boqworkflow';
import type { EscalationComponent } from '../domain/escalation';
// runs two ways: ApiDataProvider against the on-prem backend, or
// LocalDataProvider (client-only) for the static GitHub Pages demo.

export type NodeType = 'hq' | 'hq_engrs' | 'pd_hq' | 'project';

export interface OrgNode {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
  /** Geolocation for the multi-level map (HQ / PD HQ markers). */
  lat?: number;
  lng?: number;
  location?: string;
}

export interface Project {
  id: string;
  pdHqId: string;
  /** Client of THIS project (e.g. FGEHA, CDA, NHA) — NOT the app brand. */
  clientName: string;
  /** Decimal strings (PKR) to preserve precision on the wire. */
  contractValue: string;
  billedToDate: string;
  receivedToDate: string;
  /** Physical progress, 0..100. */
  plannedPct: number;
  actualPct: number;
  archived?: boolean;
  /** Project identity / contract dates (captured at creation). */
  projectCode?: string;
  /** ISO yyyy-mm-dd. */
  commencementDate?: string;
  completionDate?: string;
  /** Geolocation (for the portfolio map). */
  lat?: number;
  lng?: number;
  location?: string;
}

export interface ProjectPhoto {
  id: string;
  projectId: string;
  url: string;
  caption: string;
  dated: string;
}

/** A document attached to a register entity (IPC, RAR, …) — image or PDF, stored inline. */
export interface Attachment {
  id: string;
  projectId: string;
  entity: string;   // e.g. 'IPC' | 'RAR'
  ref: string;      // e.g. ipcNo / rarNo
  name: string;
  dataUrl: string;
  mime: string;
  size: number;     // approx bytes
  dated: string;
  note?: string;
}

export interface NodeComment {
  id: string;
  nodeId: string;
  author: string;
  body: string;
  createdAt: string; // ISO
}

// ---- Commercial (Phase 3) ----
export interface BoqItem {
  id: string;
  projectId: string;
  billNo: string;
  billName?: string;
  section?: string;
  code: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number; // derived = qty * rate
  revisedByVo?: string; // voNo of the approved variation that last revised this item
}

export type IpcStatus =
  | 'draft'
  | 'submitted'
  | 'vetted'
  | 'forwarded_to_client'
  | 'approved'
  | 'paid_pending_ack'
  | 'paid';

export interface IpcLine {
  boqItemId: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface Ipc {
  id: string;
  projectId: string;
  ipcNo: string;
  seq: number;
  period: string;
  date?: string;
  status: IpcStatus;
  gross: number;
  netPayable: number;
  cumGross: number;
  lines?: IpcLine[];
  note?: string;
}

export interface Subcontractor {
  id: string;
  projectId: string;
  name: string;
  trade: string;
  // Profile (optional; populated in the Contractor profiles screen)
  kind?: 'labor' | 'sublet';
  owner?: string;
  cnic?: string;
  pecCategory?: string; // e.g. C-A, C-1 … C-6
  enlistment?: string;  // NLC enlistment ref
  address?: string;
  contact?: string;
  performanceSecurity?: number;
}

/** Distribution planner: how a BOQ item's contract quantity is executed. */
export type ExecutionType = 'labor' | 'sublet' | 'nlc_direct';

export interface Allocation {
  id: string;
  projectId: string;
  boqItemId: string;
  executionType: ExecutionType;
  contractorId?: string; // labor/sublet contractor (subcontractor pool)
  qty: number;
  rate: number; // contractor rate (PKR/unit); 0 for nlc_direct
}

/** Per-contract finalisation status, keyed `${executionType}:${contractorId}`. */
export interface ContractApproval {
  key: string;
  status: 'draft' | 'locked';
  approvedBy?: string;
  at?: string;
}

export type RarStatus = 'draft' | 'submitted' | 'verified' | 'approved' | 'marked_payment' | 'paid';

export type VariationStatus = 'draft' | 'submitted' | 'recommended' | 'approved' | 'rejected';
export type VariationType = 'addition' | 'omission' | 'substitution' | 'rate_change';

/** A single BOQ change carried by a variation. */
export type VariationLineKind = 'qty' | 'rate' | 'add' | 'omit';
export interface VariationLine {
  kind: VariationLineKind;
  boqItemId?: string;        // qty / rate / omit → existing BOQ item
  // 'add' → new BOQ item particulars
  billNo?: string;
  code?: string;
  description?: string;
  unit?: string;
  newQty?: number;           // qty / add
  newRate?: number;          // rate / add
  amount: number;            // signed delta this line contributes to the contract
}

/** Variation / change-order against the contract. Signed `amount` (omissions negative). */
export interface Variation {
  id: string;
  projectId: string;
  voNo: string;
  seq: number;
  title: string;
  type: VariationType;
  amount: number;
  status: VariationStatus;
  boqItemId?: string;
  date?: string;
  note?: string;
  lines?: VariationLine[];
  appliedToBoq?: boolean;    // set when an approved VO has revised the BOQ
}

export type ContractStatus = 'draft' | 'awarded' | 'in_progress' | 'completed' | 'closed';
/** A subcontract package with a unique number; RARs bill against a contract. */
export interface Contract {
  id: string;
  projectId: string;
  contractNo: string;
  title: string;
  subcontractorId: string;
  scopeBills: string[];
  value: number;
  awardDate?: string;
  completionDate?: string;
  status: ContractStatus;
  /** Retention withheld from this subcontractor's RARs (% of each RAR gross). Default 5. */
  retentionPct?: number;
}

/**
 * Per-project commercial deductions. IPCs/EPCs are revenue inflow (client billing);
 * RARs are expenditure (subcontractor payment), so they carry their own tax rates.
 * IPC net = gross − ipc retention − income tax − GST/stamp.
 * RAR net = gross − contract retention − rar income tax − rar GST/stamp.
 */
export interface CommercialConfig {
  /** Retention withheld by the client from each IPC (% of IPC gross). */
  ipcRetentionPct: number;
  /** Income tax withheld at source on each IPC (% of gross). */
  incomeTaxPct: number;
  /** GST / stamp duty on IPCs (% of gross). */
  gstPct: number;
  /** Income tax withheld from subcontractor RARs (% of gross). */
  rarIncomeTaxPct: number;
  /** GST / stamp on subcontractor RARs (% of gross). */
  rarGstPct: number;
  /** Tolerance (± % points) between an activity's schedule-expected %% and its derived physical %% before a divergence flag (req 3a(6)). */
  divergenceTolerancePct?: number;
}

export interface RarLine { boqItemId: string; qty: number; rate: number; amount: number }

export interface Rar {
  id: string;
  projectId: string;
  rarNo: string;
  seq: number;
  period: string;
  date?: string;
  status: RarStatus;
  subcontractorId: string;
  contractId?: string;
  gross: number;
  netPayable: number;
  lines?: RarLine[];
  recoveries?: RarRecovery[];
  note?: string;
  // Billing approval chain (interim vs final bill)
  isFinal?: boolean;
  chainStage?: number;
  recoveriesNetted?: boolean;
}

export type RarRecoveryKind = 'material' | 'machinery' | 'other';

/**
 * A recovery deducted from a subcontractor RAR:
 *  - material:  NLC-issued material consumed in the executed works (not labour contracts)
 *  - machinery: NLC plant/machinery usage charges (not labour-only contracts)
 *  - other:     any other recovery, described with an amount.
 */
export interface RarRecovery {
  id: string;
  kind: RarRecoveryKind;
  description: string;
  amount: number;
}

/** Recovery link: amount recovered from a RAR against a client IPC. */
export interface RarIpcLink {
  id: string;
  projectId: string;
  rarId: string;
  ipcId: string;
  amount: number;
}

/** Escalation Price Certificate — shares the IPC pipeline. */
export interface Epc {
  id: string;
  projectId: string;
  epcNo: string;
  seq: number;
  period: string;
  status: IpcStatus;
  amount: number;
  ipcNo?: string;
  note?: string;
}

export interface Advance {
  id: string;
  projectId: string;
  kind: 'mob' | 'secure';
  direction: 'client_receipt' | 'sub_disbursement';
  subcontractorId?: string;
  amount: number;
  dated: string;
  note?: string;
}

/** Bank guarantee backing an advance (mobilisation/secure) — client-side (NLC→FGEHA) or sub-side (S/C→NLC). */
export interface BankGuarantee {
  id: string;
  projectId: string;
  kind: 'mob' | 'secure';
  party: 'client' | 'sub';
  subcontractorId?: string;
  bgNo: string;
  bank: string;
  amount: number;
  issued?: string;
  expires?: string;
  status: 'active' | 'released' | 'expired';
}

export type DistributionMode = 'unassigned' | 'self' | 'sublet';

export interface Distribution {
  boqItemId: string;
  projectId: string;
  mode: DistributionMode;
  subcontractorId?: string;
  allocatedQty: number;
}

// ---- Execution & baselines (Phase 4) ----
export interface ScheduleActivity {
  id: string;
  projectId: string;
  activityId: string;
  name: string;
  wbs: string;
  durationDays: number;
  plannedStart: string;
  plannedFinish: string;
  isMilestone: boolean;
}

/** One point of the monthly cumulative S-curve. `actual` is null beyond now. */
export interface MonthlySeriesPoint {
  month: string;
  planned: number;
  actual: number | null;
}

export type ResourceClass = 'store' | 'plant' | 'equipment';
export interface Resource {
  id: string;
  projectId: string;
  resourceClass: ResourceClass;
  name: string;
  unit: string;
  qty: number;
}

// ---- Mapping (Phase 4) ----
export type MapConfidence = 'confirmed' | 'auto' | 'disputed';
export interface BoqWbsLink {
  boqItemId: string;
  projectId: string;
  activityId: string;
  confidence: MapConfidence;
  /** Share of the item's value carried by this activity (0..1). Omitted = even split across the item's links. */
  weight?: number;
}
export interface BoqMaterialLink {
  boqItemId: string;
  projectId: string;
  materialRef: string;
  coeff: number;
  confidence: MapConfidence;
  /** Procurement lead time for this material (days from order to receipt). */
  leadDays?: number;
}

// ---- Financial (Phase 5) ----
export interface FinancialReceipt {
  id: string;
  projectId: string;
  month: string;
  source: string; // e.g. 'IPC-01', 'Mob advance'
  amount: number;
  note?: string;
}
export type PaymentCategory = 'materials' | 'labour' | 'plant' | 'subcontract' | 'overhead';
export interface FinancialPayment {
  id: string;
  projectId: string;
  month: string;
  category: PaymentCategory;
  amount: number;
  note?: string;
  /** Optional BOQ item reference (req 3e(3)) so planned / committed / incurred / paid compare at item level. */
  boqItemId?: string;
}
export interface FinancialLiability {
  id: string;
  projectId: string;
  kind: string; // 'Retention held', 'Outstanding RAR', …
  amount: number;
}

// ---- Procurement (Phase 6) ----
export type ProcChainType =
  | 'proc_demand_material'
  | 'proc_demand_machinery'
  | 'machinery_demand'
  | 'proc_payment_material'
  | 'proc_payment_machinery'
  | 'machinery_payment';

export interface ApprovalEvent {
  stageIndex: number;
  action: string;
  role: string;
  at: string;
}

export interface Supplier {
  id: string;
  projectId: string;
  name: string;
  kind: 'material' | 'machinery' | 'both';
}

export interface DemandItem {
  code: string;
  description: string;
  unit: string;
  qty: number;
  estimatedRate: number;
  boqItemId?: string;
}

export type DemandType = 'material' | 'machinery' | 'machinery_hire';

export interface Demand {
  id: string;
  projectId: string;
  demandNo: string;
  seq: number;
  type: DemandType;
  justification: string;
  totalEstimated: number;
  chainType: ProcChainType;
  currentStage: number;
  items: DemandItem[];
  history: ApprovalEvent[];
}

export interface PurchaseOrder {
  id: string;
  projectId: string;
  poNo: string;
  seq: number;
  demandId: string;
  supplierId: string;
  totalValue: number;
  status: 'open' | 'closed';
}

export interface CrvLine {
  code: string;
  qtyReceived: number;
}
export interface Crv {
  id: string;
  projectId: string;
  crvNo: string;
  seq: number;
  poId: string;
  received: CrvLine[];
  overReceipt: boolean;
}

export interface ProcPayment {
  id: string;
  projectId: string;
  paymentNo: string;
  seq: number;
  refType: 'po' | 'hire';
  refId: string;
  amount: number;
  chainType: ProcChainType;
  currentStage: number;
  history: ApprovalEvent[];
}

export interface MachineryHire {
  id: string;
  projectId: string;
  hireNo: string;
  seq: number;
  supplierId: string;
  rateBasis: 'per_day' | 'per_hour' | 'lumpsum';
  rate: number;
  utilization: Array<{ dated: string; units: number }>;
}

// ---- Audit (Phase 7) — append-only workflow trail ----
/** A named system user (req 3j): appointment role + organisational scope.
 * Access is scoped to the user's node subtree — directorate and project users
 * see their own data; HQ users see the roll-up. SSO binds to this later. */
export interface AppUser {
  id: string;
  name: string;
  role: string;    // ROLE_LABEL key or 'admin'
  nodeId: string;  // org scope: this node and everything beneath it
}

/** Command directive (instruction) lifecycle: issued by a commander at a node,
 * assigned to a role within a scope, acted upon and answered within time. */
export type DirectiveStatus = 'issued' | 'acknowledged' | 'in_progress' | 'complied' | 'closed';
export interface DirectiveResponse {
  id: string;
  by: string;       // acting role / user name
  at: string;       // ISO
  text: string;
}
export interface Directive {
  id: string;
  /** Org node whose commander issued it (scope of authority). */
  nodeId: string;
  /** Optional specific project it concerns. */
  projectId?: string;
  title: string;
  detail: string;
  issuedBy: string;      // name/role of the commander
  assigneeRole: string;  // who must act
  assigneeNodeId: string;// where (their scope)
  dueDate: string;       // ISO date — overdue past this without compliance
  status: DirectiveStatus;
  responses: DirectiveResponse[];
  createdAt: string;
  updatedAt: string;
}

/** Triage status of a computed alert (req 3i(2)): flag → acknowledge → resolve, or mute with reason. */
export type AlertStatus = 'open' | 'ack' | 'resolved' | 'muted';
export interface AlertState {
  alertId: string;     // stable computed alert id (e.g. 'bg-…', 'dv-…')
  status: AlertStatus;
  by: string;          // acting role
  note?: string;       // required for mute/resolve
  updatedAt: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  projectId: string;
  action: string;
  entity: string;
  ref: string;
  detail?: string;
}

// ---- Production & materials ----
export interface ProductionRun {
  id: string;
  projectId: string;
  dated: string;
  product: string; // e.g. 'Asphalt wearing course'
  unit: string;
  plannedQty: number;
  actualQty: number;
}

export interface MaterialIssue {
  id: string;
  projectId: string;
  dated: string;
  materialCode: string;
  qty: number;
  issuedTo: string; // activity / WBS / location
  // Recovery linkage (material issued to a contractor, recovered via RAR/Final Bill)
  contractorId?: string;
  rate?: number;       // issue rate (PKR/unit) → issued value = qty × rate
  recovered?: number;  // amount recovered to date
}

/**
 * NLC plant/machinery hired out to a contractor for execution. Usage value =
 * hours × hourly rate; the balance (value − recovered) is recoverable from the
 * contractor's RAR (except labour-only contracts). Parallels MaterialIssue.
 */
export interface MachineryUsage {
  id: string;
  projectId: string;
  dated: string;
  machineryCode: string;   // plant/equipment code or reg no.
  description: string;
  hours: number;
  rate: number;            // hourly hire rate (PKR/hr) → value = hours × rate
  contractorId?: string;
  recovered?: number;
}

/** Planned indirect/overhead cost line (Planning Engineer); actuals from Financial. */
export interface OverheadLine {
  id: string;
  projectId: string;
  category: string; // Salaries, Light-vehicle POL, etc.
  month: string;
  plannedCost: number;
}

/** Progress update: QS enters executed qty per BOQ item/period; PM validates. */
export interface ProgressUpdate {
  id: string;
  projectId: string;
  boqItemId: string;
  period: string;
  executedQty: number;
  status: 'draft' | 'validated';
  enteredBy?: string;
  validatedBy?: string;
}

/** HR posting per org node (project or HQ level). */
export interface HrPosting {
  id: string;
  nodeId: string;
  category: string; // Engineers, Surveyors, Operators, Admin, etc.
  sanctioned: number;
  posted: number;
}

/**
 * A post or section in a node's HR establishment — the building block of the
 * organogram (Table of Organisation). Units form a tree via `parentId`; the
 * head of the establishment has parentId === null. `auth` is the authorised
 * strength (AUTH) and `held` the filled strength (HELD).
 */
export interface HrUnit {
  id: string;
  nodeId: string;
  parentId: string | null;
  title: string;        // 'Dir Proj (Centre)', 'HR Sec', 'Site Engr'
  scale?: string;       // 'NLC-17', 'Lt Col / Col', etc.
  category?: string;    // optional link to an HR category bucket
  auth: number;
  held: number;
  order: number;        // sibling order within the same parent
}

export type HrPersonStatus = 'present' | 'leave' | 'detached' | 'training';

/** A named individual occupying (or available for) an establishment post. */
export interface HrPerson {
  id: string;
  nodeId: string;          // org node they belong to
  unitId: string | null;   // the HrUnit post they fill (null = bench / unassigned)
  name: string;
  rank?: string;           // 'Maj (R)', 'NLC-17', civilian grade
  cnic?: string;
  contact?: string;
  photoUrl?: string;       // optional avatar
  postingDate?: string;    // ISO date posted in
  status: HrPersonStatus;
  category?: string;       // analytics mirror
}

export type ReqStage = 'raised' | 'advertised' | 'interview' | 'offer' | 'joined';

/** A recruitment requisition raised against a vacant post. */
export interface HrRequisition {
  id: string;
  nodeId: string;
  unitId: string;          // post being filled
  title: string;           // snapshot of the post title
  count: number;           // seats sought
  stage: ReqStage;
  raisedAt: string;        // ISO
  note?: string;
}

export type CredentialKind = 'PEC' | 'License' | 'Certification' | 'Training' | 'Medical';

/** A qualification / licence held by a person, with an optional expiry. */
export interface HrCredential {
  id: string;
  nodeId: string;
  personId: string;
  personName: string;      // snapshot for display
  kind: CredentialKind;
  ref: string;             // PEC no, licence no, certificate id
  issued?: string;         // ISO date
  expires?: string;        // ISO date (blank = non-expiring)
  note?: string;
}

export type TransferStage = 'raised' | 'recommended' | 'approved' | 'effected' | 'rejected';

/** A posting / deployment order moving a person between posts or nodes. */
export interface HrTransfer {
  id: string;
  personId: string;
  personName: string;
  fromNodeId: string;
  fromNodeName: string;
  fromUnitId: string | null;
  toNodeId: string;
  toNodeName: string;
  toUnitId: string | null;
  toUnitTitle: string;
  stage: TransferStage;
  reason?: string;
  raisedAt: string;        // ISO
  effectiveDate?: string;  // ISO when effected
}

/** A captured snapshot of a node's establishment (TO&E) for versioning. */
export interface HrEstablishmentVersion {
  id: string;
  nodeId: string;
  version: number;         // v1, v2, …
  label: string;
  status: 'draft' | 'sanctioned';
  createdAt: string;       // ISO
  approvedBy?: string;
  snapshot: HrUnit[];
}

/** Inventory: integral or hired plant/equipment/vehicles + utilisation. */
export interface InventoryItem {
  id: string;
  projectId: string;
  kind: 'plant' | 'equipment' | 'vehicle';
  ownership: 'integral' | 'hired';
  name: string;
  regNo: string;
  status: 'operational' | 'idle' | 'breakdown';
  utilizationPct: number;
}

/** POL (fuel) ledger: procured vs issued vs ideal-vs-actual consumption. */
export interface PolRecord {
  id: string;
  projectId: string;
  month: string;
  fuel: 'diesel' | 'petrol';
  procured: number;     // litres
  issued: number;       // litres
  idealConsumption: number;  // litres per running
  actualConsumption: number; // litres per running
}

export interface FixedAsset {
  id: string;
  projectId: string;
  category: string;
  description: string;
  value: number;
  acquired: string;
}

/** Maintenance request workflow: PM validate → Manager Procurement approve → FM pay. */
export interface MaintenanceRequest {
  id: string;
  projectId: string;
  reqNo: string;
  asset: string;
  description: string;
  estCost: number;
  stageIndex: number;
}

/** Project salients — editable key facts shown on the executive tab. */
export interface Salient {
  id: string;
  projectId: string;
  label: string;
  value: string;
}

export interface DataProvider {
  readonly mode: 'api' | 'local';
  listNodes(): Promise<OrgNode[]>;
  listProjects(): Promise<Project[]>;
  // Project & org lifecycle
  createProject(input: {
    pdHqId: string; name: string; clientName: string;
    contractValue: string; plannedPct?: number; actualPct?: number;
    projectCode?: string; commencementDate?: string; completionDate?: string;
    lat?: number; lng?: number; location?: string;
  }): Promise<Project>;
  updateProject(projectId: string, patch: Partial<Pick<Project,
    'clientName' | 'contractValue' | 'billedToDate' | 'receivedToDate' | 'plannedPct' | 'actualPct'
    | 'projectCode' | 'commencementDate' | 'completionDate' | 'lat' | 'lng' | 'location'>>): Promise<Project>;
  /** Set an org node's (HQ / PD HQ) map location. */
  updateNodeLocation(nodeId: string, patch: { lat?: number; lng?: number; location?: string }): Promise<OrgNode>;
  archiveProject(projectId: string): Promise<void>;
  restoreProject(projectId: string): Promise<void>;
  listArchivedProjects(): Promise<Project[]>;
  addPdHq(name: string): Promise<OrgNode>;
  // Progress photo gallery
  listPhotos(projectId: string): Promise<ProjectPhoto[]>;
  addPhoto(projectId: string, input: { url: string; caption: string; dated: string }): Promise<ProjectPhoto>;
  deletePhoto(projectId: string, id: string): Promise<void>;
  listAttachments(projectId: string, entity: string, reference: string): Promise<Attachment[]>;
  addAttachment(projectId: string, input: { entity: string; reference: string; name: string; dataUrl: string; mime: string; size: number; dated: string; note?: string }): Promise<Attachment>;
  deleteAttachment(projectId: string, id: string): Promise<void>;
  listComments(nodeId: string): Promise<NodeComment[]>;
  addComment(nodeId: string, body: string): Promise<NodeComment>;
  // Commercial — BOQ + IPC
  listBoq(projectId: string): Promise<BoqItem[]>;
  replaceBoq(
    projectId: string,
    items: Array<Pick<BoqItem, 'billNo' | 'code' | 'description' | 'unit' | 'qty' | 'rate'>>,
  ): Promise<BoqItem[]>;
  getBoqWorkflow(projectId: string): Promise<BoqWorkflowState>;
  advanceBoqWorkflow(projectId: string, role: string): Promise<BoqWorkflowState>;
  raiseBoqVo(projectId: string): Promise<BoqWorkflowState>;
  // Distribution planner — allocations + contracts
  listAllocations(projectId: string): Promise<Allocation[]>;
  upsertAllocation(projectId: string, input: Omit<Allocation, 'id' | 'projectId'> & { id?: string }): Promise<Allocation[]>;
  deleteAllocation(projectId: string, id: string): Promise<Allocation[]>;
  listContractApprovals(projectId: string): Promise<ContractApproval[]>;
  approveContract(projectId: string, key: string, role: string, value: number): Promise<ContractApproval[]>;
  listIpcs(projectId: string): Promise<Ipc[]>;
  createIpc(projectId: string, input: { period: string; gross: number; date?: string; lines?: IpcLine[] }): Promise<Ipc>;
  transitionIpc(projectId: string, ipcNo: string, action: string): Promise<Ipc>;
  setIpcNote(projectId: string, ipcNo: string, note: string): Promise<Ipc>;
  // Commercial — subcontractors, RAR, recovery, EPC, advances, distributions
  listSubcontractors(projectId: string): Promise<Subcontractor[]>;
  addSubcontractor(projectId: string, input: { name: string; trade: string }): Promise<Subcontractor>;
  updateSubcontractor(projectId: string, id: string, patch: Partial<Omit<Subcontractor, 'id' | 'projectId'>>): Promise<Subcontractor>;
  listRars(projectId: string): Promise<Rar[]>;
  createRar(
    projectId: string,
    input: { period: string; subcontractorId: string; contractId?: string; gross: number; date?: string; lines?: RarLine[] },
  ): Promise<Rar>;
  transitionRar(projectId: string, rarNo: string, action: string): Promise<Rar>;
  setRarFinal(projectId: string, rarNo: string, isFinal: boolean): Promise<Rar>;
  setRarRecoveriesNetted(projectId: string, rarNo: string, netted: boolean): Promise<Rar>;
  setRarRecoveries(projectId: string, rarNo: string, recoveries: RarRecovery[]): Promise<Rar>;
  advanceRarChain(projectId: string, rarNo: string, role: string): Promise<Rar>;
  setRarNote(projectId: string, rarNo: string, note: string): Promise<Rar>;
  listRarIpcLinks(projectId: string): Promise<RarIpcLink[]>;
  addRarIpcLink(projectId: string, input: { rarId: string; ipcId: string; amount: number }): Promise<RarIpcLink>;
  listEpcs(projectId: string): Promise<Epc[]>;
  createEpc(projectId: string, input: { period: string; amount: number; ipcNo?: string }): Promise<Epc>;
  listEscalationComponents(projectId: string): Promise<EscalationComponent[]>;
  setEscalationComponents(projectId: string, components: EscalationComponent[]): Promise<void>;
  listVariations(projectId: string): Promise<Variation[]>;
  createVariation(projectId: string, input: { title: string; type?: VariationType; amount?: number; boqItemId?: string; date?: string; lines?: VariationLine[] }): Promise<Variation>;
  transitionVariation(projectId: string, voNo: string, action: string): Promise<Variation>;
  listContracts(projectId: string): Promise<Contract[]>;
  createContract(projectId: string, input: { title: string; subcontractorId: string; scopeBills: string[]; value: number; awardDate?: string; retentionPct?: number }): Promise<Contract>;
  setContractStatus(projectId: string, contractId: string, status: ContractStatus): Promise<void>;
  setContractRetention(projectId: string, contractId: string, retentionPct: number): Promise<void>;
  getCommercialConfig(projectId: string): Promise<CommercialConfig>;
  setCommercialConfig(projectId: string, config: CommercialConfig): Promise<CommercialConfig>;
  transitionEpc(projectId: string, epcNo: string, action: string): Promise<Epc>;
  listAdvances(projectId: string): Promise<Advance[]>;
  addAdvance(projectId: string, input: Omit<Advance, 'id' | 'projectId'>): Promise<Advance>;
  listBankGuarantees(projectId: string): Promise<BankGuarantee[]>;
  addBankGuarantee(projectId: string, input: Omit<BankGuarantee, 'id' | 'projectId'>): Promise<BankGuarantee>;
  setBankGuaranteeStatus(projectId: string, id: string, status: BankGuarantee['status']): Promise<BankGuarantee[]>;
  listDistributions(projectId: string): Promise<Distribution[]>;
  setDistribution(projectId: string, dist: Distribution): Promise<Distribution>;
  // Execution & baselines
  listSchedule(projectId: string): Promise<ScheduleActivity[]>;
  replaceSchedule(projectId: string, rows: Array<Omit<ScheduleActivity, 'id' | 'projectId'>>): Promise<ScheduleActivity[]>;
  importScurve(projectId: string, points: MonthlySeriesPoint[]): Promise<MonthlySeriesPoint[]>;
  // Schedule baseline approval cycle
  getScheduleWorkflow(projectId: string): Promise<BaselineWorkflowState>;
  advanceScheduleWorkflow(projectId: string, role: string): Promise<BaselineWorkflowState>;
  amendScheduleBaseline(projectId: string): Promise<BaselineWorkflowState>;
  // Overheads (planned indirect costs)
  listOverheads(projectId: string): Promise<OverheadLine[]>;
  upsertOverhead(projectId: string, input: Omit<OverheadLine, 'id' | 'projectId'> & { id?: string }): Promise<OverheadLine[]>;
  deleteOverhead(projectId: string, id: string): Promise<OverheadLine[]>;
  listMonthlySeries(projectId: string): Promise<MonthlySeriesPoint[]>;
  setMonthlyActual(projectId: string, month: string, actual: number): Promise<MonthlySeriesPoint[]>;
  listResources(projectId: string): Promise<Resource[]>;
  addResource(projectId: string, input: Omit<Resource, 'id' | 'projectId'>): Promise<Resource>;
  // Mapping
  listBoqWbs(projectId: string): Promise<BoqWbsLink[]>;
  /** Upsert keyed by (boqItemId, activityId) — a BOQ item may map to many activities and vice versa. */
  setBoqWbs(projectId: string, link: BoqWbsLink): Promise<BoqWbsLink>;
  removeBoqWbs(projectId: string, boqItemId: string, activityId: string): Promise<BoqWbsLink[]>;
  /** A BOQ item is a material COMPOSITION (e.g. concrete = cement + sand + crush + admixture): upsert keyed by (boqItemId, materialRef). */
  removeBoqMaterial(projectId: string, boqItemId: string, materialRef: string): Promise<BoqMaterialLink[]>;
  listBoqMaterial(projectId: string): Promise<BoqMaterialLink[]>;
  setBoqMaterial(projectId: string, link: BoqMaterialLink): Promise<BoqMaterialLink>;
  // Financial
  listReceipts(projectId: string): Promise<FinancialReceipt[]>;
  addReceipt(projectId: string, input: Omit<FinancialReceipt, 'id' | 'projectId'>): Promise<FinancialReceipt>;
  listPayments(projectId: string): Promise<FinancialPayment[]>;
  addPayment(projectId: string, input: Omit<FinancialPayment, 'id' | 'projectId'>): Promise<FinancialPayment>;
  listLiabilities(projectId: string): Promise<FinancialLiability[]>;
  addLiability(projectId: string, input: Omit<FinancialLiability, 'id' | 'projectId'>): Promise<FinancialLiability>;
  // Procurement
  listSuppliers(projectId: string): Promise<Supplier[]>;
  addSupplier(projectId: string, input: Omit<Supplier, 'id' | 'projectId'>): Promise<Supplier>;
  listDemands(projectId: string): Promise<Demand[]>;
  createDemand(projectId: string, input: { type: DemandType; justification: string; items: DemandItem[] }): Promise<Demand>;
  advanceDemand(projectId: string, demandNo: string, role: string): Promise<Demand>;
  listPurchaseOrders(projectId: string): Promise<PurchaseOrder[]>;
  createPurchaseOrder(projectId: string, input: { demandId: string; supplierId: string }): Promise<PurchaseOrder>;
  listCrvs(projectId: string): Promise<Crv[]>;
  createCrv(projectId: string, input: { poId: string; received: CrvLine[] }): Promise<Crv>;
  listProcPayments(projectId: string): Promise<ProcPayment[]>;
  createProcPayment(projectId: string, input: { refType: 'po' | 'hire'; refId: string; amount: number; chainType: ProcChainType }): Promise<ProcPayment>;
  advanceProcPayment(projectId: string, paymentNo: string, role: string): Promise<ProcPayment>;
  listHires(projectId: string): Promise<MachineryHire[]>;
  createHire(projectId: string, input: { supplierId: string; rateBasis: MachineryHire['rateBasis']; rate: number }): Promise<MachineryHire>;
  addHireUtilization(projectId: string, hireNo: string, entry: { dated: string; units: number }): Promise<MachineryHire>;
  // Production & materials
  listProductionRuns(projectId: string): Promise<ProductionRun[]>;
  createProductionRun(projectId: string, input: Omit<ProductionRun, 'id' | 'projectId'>): Promise<ProductionRun>;
  listMaterialIssues(projectId: string): Promise<MaterialIssue[]>;
  createMaterialIssue(projectId: string, input: Omit<MaterialIssue, 'id' | 'projectId'>): Promise<MaterialIssue>;
  setMaterialRecovered(projectId: string, id: string, recovered: number): Promise<MaterialIssue[]>;
  listMachineryUsage(projectId: string): Promise<MachineryUsage[]>;
  createMachineryUsage(projectId: string, input: Omit<MachineryUsage, 'id' | 'projectId'>): Promise<MachineryUsage>;
  setMachineryRecovered(projectId: string, id: string, recovered: number): Promise<MachineryUsage[]>;
  // Mapping approval cycle
  getMappingWorkflow(projectId: string): Promise<BaselineWorkflowState>;
  advanceMappingWorkflow(projectId: string, role: string): Promise<BaselineWorkflowState>;
  amendMapping(projectId: string): Promise<BaselineWorkflowState>;
  // Salients
  listSalients(projectId: string): Promise<Salient[]>;
  upsertSalient(projectId: string, input: { id?: string; label: string; value: string }): Promise<Salient>;
  deleteSalient(projectId: string, id: string): Promise<void>;
  // Audited reverse
  reverseIpc(projectId: string, ipcNo: string): Promise<Ipc>;
  // Period mapping (IPC period -> schedule month)
  getPeriodMap(projectId: string): Promise<Record<string, string>>;
  setPeriodMapping(projectId: string, ipcNo: string, month: string): Promise<Record<string, string>>;
  // Audit
  listAudit(): Promise<AuditEntry[]>;
  /** Alert triage lifecycle (req 3i(2)): computed alerts carry stable ids; states persist triage. */
  listDirectives(): Promise<Directive[]>;
  createDirective(input: Omit<Directive, 'id' | 'status' | 'responses' | 'createdAt' | 'updatedAt'>): Promise<Directive>;
  respondDirective(id: string, by: string, text: string, status?: DirectiveStatus): Promise<Directive[]>;
  setDirectiveStatus(id: string, status: DirectiveStatus, by: string): Promise<Directive[]>;
  listUsers(): Promise<AppUser[]>;
  upsertUser(input: Omit<AppUser, 'id'> & { id?: string }): Promise<AppUser[]>;
  deleteUser(id: string): Promise<AppUser[]>;
  listAlertStates(projectId: string): Promise<AlertState[]>;
  setAlertState(projectId: string, state: Omit<AlertState, 'updatedAt'>): Promise<AlertState[]>;
  /** Write an authorised-override entry to the audit trail (req 3b(4)). */
  recordOverride(projectId: string, entity: string, ref: string, detail: string): Promise<void>;
  // Progress updates (QS enter → PM validate) — single source of physical progress
  listProgress(projectId: string): Promise<ProgressUpdate[]>;
  upsertProgress(projectId: string, input: { boqItemId: string; period: string; executedQty: number; role: string; id?: string }): Promise<ProgressUpdate[]>;
  validateProgress(projectId: string, id: string, role: string): Promise<ProgressUpdate[]>;
  // HR postings (per org node) + roll-up
  listHr(nodeId: string): Promise<HrPosting[]>;
  upsertHr(nodeId: string, input: Omit<HrPosting, 'id' | 'nodeId'> & { id?: string }): Promise<HrPosting[]>;
  deleteHr(nodeId: string, id: string): Promise<HrPosting[]>;
  listAllHr(): Promise<HrPosting[]>;
  // HR establishment / organogram (per org node)
  listHrUnits(nodeId: string): Promise<HrUnit[]>;
  listAllHrUnits(): Promise<HrUnit[]>;
  upsertHrUnit(nodeId: string, input: Omit<HrUnit, 'id' | 'nodeId'> & { id?: string }): Promise<HrUnit[]>;
  deleteHrUnit(nodeId: string, id: string): Promise<HrUnit[]>;
  // HR people / roster (per org node)
  listPeople(nodeId: string): Promise<HrPerson[]>;
  listAllPeople(): Promise<HrPerson[]>;
  upsertPerson(nodeId: string, input: Omit<HrPerson, 'id' | 'nodeId'> & { id?: string }): Promise<HrPerson[]>;
  deletePerson(nodeId: string, id: string): Promise<HrPerson[]>;
  // HR recruitment requisitions (per org node)
  listRequisitions(nodeId: string): Promise<HrRequisition[]>;
  upsertRequisition(nodeId: string, input: Omit<HrRequisition, 'id' | 'nodeId' | 'raisedAt'> & { id?: string }): Promise<HrRequisition[]>;
  advanceRequisition(nodeId: string, id: string): Promise<HrRequisition[]>;
  deleteRequisition(nodeId: string, id: string): Promise<HrRequisition[]>;
  // HR credentials / qualifications (per org node)
  listCredentials(nodeId: string): Promise<HrCredential[]>;
  upsertCredential(nodeId: string, input: Omit<HrCredential, 'id' | 'nodeId'> & { id?: string }): Promise<HrCredential[]>;
  deleteCredential(nodeId: string, id: string): Promise<HrCredential[]>;
  // HR postings / deployment (cross-node transfers, global store)
  listTransfersForNode(nodeId: string): Promise<HrTransfer[]>;
  raiseTransfer(input: Omit<HrTransfer, 'id' | 'stage' | 'raisedAt'>): Promise<HrTransfer[]>;
  advanceTransfer(id: string): Promise<HrTransfer[]>;
  rejectTransfer(id: string): Promise<HrTransfer[]>;
  effectTransfer(id: string): Promise<HrTransfer[]>;
  deleteTransfer(id: string): Promise<HrTransfer[]>;
  // HR establishment versioning (per org node)
  listEstablishmentVersions(nodeId: string): Promise<HrEstablishmentVersion[]>;
  snapshotEstablishment(nodeId: string, label: string): Promise<HrEstablishmentVersion[]>;
  sanctionEstablishmentVersion(nodeId: string, id: string, approvedBy: string): Promise<HrEstablishmentVersion[]>;
  deleteEstablishmentVersion(nodeId: string, id: string): Promise<HrEstablishmentVersion[]>;
  // Procurement — inventory / POL / fixed assets / maintenance
  listInventory(projectId: string): Promise<InventoryItem[]>;
  upsertInventory(projectId: string, input: Omit<InventoryItem, 'id' | 'projectId'> & { id?: string }): Promise<InventoryItem[]>;
  listPol(projectId: string): Promise<PolRecord[]>;
  addPol(projectId: string, input: Omit<PolRecord, 'id' | 'projectId'>): Promise<PolRecord[]>;
  listFixedAssets(projectId: string): Promise<FixedAsset[]>;
  addFixedAsset(projectId: string, input: Omit<FixedAsset, 'id' | 'projectId'>): Promise<FixedAsset[]>;
  listMaintenance(projectId: string): Promise<MaintenanceRequest[]>;
  createMaintenance(projectId: string, input: { asset: string; description: string; estCost: number }): Promise<MaintenanceRequest>;
  advanceMaintenance(projectId: string, reqNo: string, role: string): Promise<MaintenanceRequest>;
}
