// The data layer is abstracted behind one interface so the SAME React app
import type { BaselineWorkflowState } from '../domain/schedulebaseline';
import type { BoqWorkflowState } from '../domain/boqworkflow';
// runs two ways: ApiDataProvider against the on-prem backend, or
// LocalDataProvider (client-only) for the static GitHub Pages demo.

export type NodeType = 'hq' | 'hq_engrs' | 'pd_hq' | 'project';

export interface OrgNode {
  id: string;
  name: string;
  type: NodeType;
  parentId: string | null;
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
  code: string;
  description: string;
  unit: string;
  qty: number;
  rate: number;
  amount: number; // derived = qty * rate
}

export type IpcStatus =
  | 'draft'
  | 'submitted'
  | 'vetted'
  | 'forwarded_to_client'
  | 'approved'
  | 'paid_pending_ack'
  | 'paid';

export interface Ipc {
  id: string;
  projectId: string;
  ipcNo: string;
  seq: number;
  period: string;
  status: IpcStatus;
  gross: number;
  netPayable: number;
  cumGross: number;
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

export interface Rar {
  id: string;
  projectId: string;
  rarNo: string;
  seq: number;
  period: string;
  status: RarStatus;
  subcontractorId: string;
  gross: number;
  netPayable: number;
  note?: string;
  // Billing approval chain (interim vs final bill)
  isFinal?: boolean;
  chainStage?: number;
  recoveriesNetted?: boolean;
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
}
export interface BoqMaterialLink {
  boqItemId: string;
  projectId: string;
  materialRef: string;
  coeff: number;
  confidence: MapConfidence;
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

/** Planned indirect/overhead cost line (Planning Engineer); actuals from Financial. */
export interface OverheadLine {
  id: string;
  projectId: string;
  category: string; // Salaries, Light-vehicle POL, etc.
  month: string;
  plannedCost: number;
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
    contractValue: string; plannedPct: number; actualPct: number;
  }): Promise<Project>;
  updateProject(projectId: string, patch: Partial<Pick<Project,
    'clientName' | 'contractValue' | 'billedToDate' | 'receivedToDate' | 'plannedPct' | 'actualPct' | 'lat' | 'lng' | 'location'>>): Promise<Project>;
  archiveProject(projectId: string): Promise<void>;
  restoreProject(projectId: string): Promise<void>;
  listArchivedProjects(): Promise<Project[]>;
  addPdHq(name: string): Promise<OrgNode>;
  // Progress photo gallery
  listPhotos(projectId: string): Promise<ProjectPhoto[]>;
  addPhoto(projectId: string, input: { url: string; caption: string; dated: string }): Promise<ProjectPhoto>;
  deletePhoto(projectId: string, id: string): Promise<void>;
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
  createIpc(projectId: string, input: { period: string; gross: number }): Promise<Ipc>;
  transitionIpc(projectId: string, ipcNo: string, action: string): Promise<Ipc>;
  setIpcNote(projectId: string, ipcNo: string, note: string): Promise<Ipc>;
  // Commercial — subcontractors, RAR, recovery, EPC, advances, distributions
  listSubcontractors(projectId: string): Promise<Subcontractor[]>;
  addSubcontractor(projectId: string, input: { name: string; trade: string }): Promise<Subcontractor>;
  updateSubcontractor(projectId: string, id: string, patch: Partial<Omit<Subcontractor, 'id' | 'projectId'>>): Promise<Subcontractor>;
  listRars(projectId: string): Promise<Rar[]>;
  createRar(
    projectId: string,
    input: { period: string; subcontractorId: string; gross: number },
  ): Promise<Rar>;
  transitionRar(projectId: string, rarNo: string, action: string): Promise<Rar>;
  setRarFinal(projectId: string, rarNo: string, isFinal: boolean): Promise<Rar>;
  setRarRecoveriesNetted(projectId: string, rarNo: string, netted: boolean): Promise<Rar>;
  advanceRarChain(projectId: string, rarNo: string, role: string): Promise<Rar>;
  setRarNote(projectId: string, rarNo: string, note: string): Promise<Rar>;
  listRarIpcLinks(projectId: string): Promise<RarIpcLink[]>;
  addRarIpcLink(projectId: string, input: { rarId: string; ipcId: string; amount: number }): Promise<RarIpcLink>;
  listEpcs(projectId: string): Promise<Epc[]>;
  createEpc(projectId: string, input: { period: string; amount: number }): Promise<Epc>;
  transitionEpc(projectId: string, epcNo: string, action: string): Promise<Epc>;
  listAdvances(projectId: string): Promise<Advance[]>;
  addAdvance(projectId: string, input: Omit<Advance, 'id' | 'projectId'>): Promise<Advance>;
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
  setBoqWbs(projectId: string, link: BoqWbsLink): Promise<BoqWbsLink>;
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
}
