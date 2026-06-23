import {
  DataProvider, OrgNode, Project, NodeComment, BoqItem, Ipc,
  Subcontractor, Rar, RarLine, RarIpcLink, Epc, Advance, BankGuarantee, Distribution, Variation, Contract, ContractStatus,
  ScheduleActivity, MonthlySeriesPoint, Resource, BoqWbsLink, BoqMaterialLink,
  FinancialReceipt, FinancialPayment, FinancialLiability,
  Supplier, Demand, DemandItem, DemandType, PurchaseOrder, Crv, CrvLine,
  ProcPayment, ProcChainType, MachineryHire, AuditEntry,
  ProductionRun, MaterialIssue, Salient, ProjectPhoto, Attachment, Allocation, ContractApproval, OverheadLine,
  InventoryItem, PolRecord, FixedAsset, MaintenanceRequest, HrPosting, HrUnit, HrPerson, HrRequisition, HrCredential, HrTransfer, HrEstablishmentVersion, ProgressUpdate,
} from './types';
import type { BoqWorkflowState } from '../domain/boqworkflow';
import type { BaselineWorkflowState } from '../domain/schedulebaseline';
import type { EscalationComponent } from '../domain/escalation';
import { LocalDataProvider, setKvStore } from './LocalDataProvider';
import { RemoteKvStore } from './RemoteKvStore';

// Talks to the on-prem backend per FGEHA_NLC_API_Contract.md. Stubbed here;
// the full build maps each method to a contract endpoint, sends the AD/SSO
// token, and surfaces the standard error envelope + 409 optimistic-lock.
/**
 * LEGACY / not wired at runtime. `makeDataProvider()` returns `LocalDataProvider`
 * for BOTH local and api modes; api mode persists by swapping the provider's KvStore
 * to `RemoteKvStore`, which round-trips every document through `/api/state` (JSONB in
 * fnpc.app_doc). So new entities persist server-side for free — there is no per-entity
 * REST route to "wire". The bespoke endpoints below are vestigial and never called;
 * they exist only so this class still satisfies the DataProvider interface. The real
 * api-mode persistence is proven in data/apiMode.test.ts and server/test/docstore.test.ts.
 */
export class ApiDataProvider implements DataProvider {
  readonly mode = 'api' as const;
  constructor(private baseUrl: string, private authUser = 'demo') {}

  /** Shared headers — dev auth stand-in (X-User) until SSO lands. */
  private headers(json = false): Record<string, string> {
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(this.authUser ? { 'X-User': this.authUser } : {}),
    };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
    return (await res.json()) as T;
  }

  async listNodes(): Promise<OrgNode[]> {
    return this.get<OrgNode[]>('/api/nodes');
  }
  async listProjects(): Promise<Project[]> {
    const body = await this.get<{ items: Project[] }>('/api/projects');
    return body.items;
  }
  async createProject(input: { pdHqId: string; name: string; clientName: string; contractValue: string; plannedPct?: number; actualPct?: number; projectCode?: string; commencementDate?: string; completionDate?: string; lat?: number; lng?: number; location?: string }): Promise<Project> {
    return this.send<Project>('/api/projects', 'POST', input);
  }
  async updateProject(projectId: string, patch: Partial<Project>): Promise<Project> {
    return this.send<Project>(`/api/projects/${projectId}`, 'PATCH', patch);
  }
  async updateNodeLocation(nodeId: string, patch: { lat?: number; lng?: number; location?: string }): Promise<OrgNode> {
    return this.send<OrgNode>(`/api/nodes/${nodeId}/location`, 'PATCH', patch);
  }
  async archiveProject(projectId: string): Promise<void> {
    await this.send(`/api/projects/${projectId}/archive`, 'POST', {});
  }
  async restoreProject(projectId: string): Promise<void> {
    await this.send(`/api/projects/${projectId}/restore`, 'POST', {});
  }
  async listArchivedProjects(): Promise<Project[]> {
    return (await this.get<{ items: Project[] }>('/api/projects?archived=1')).items;
  }
  async addPdHq(name: string): Promise<OrgNode> {
    return this.send<OrgNode>('/api/nodes/pd-hq', 'POST', { name });
  }
  async listPhotos(projectId: string): Promise<ProjectPhoto[]> {
    return (await this.get<{ items: ProjectPhoto[] }>(`/api/projects/${projectId}/photos`)).items;
  }
  async addPhoto(projectId: string, input: { url: string; caption: string; dated: string }): Promise<ProjectPhoto> {
    return this.send<ProjectPhoto>(`/api/projects/${projectId}/photos`, 'POST', input);
  }
  async deletePhoto(projectId: string, id: string): Promise<void> {
    await this.send(`/api/projects/${projectId}/photos/${id}`, 'DELETE', {});
  }
  async listAttachments(projectId: string, entity: string, reference: string): Promise<Attachment[]> {
    return (await this.get<{ items: Attachment[] }>(`/api/projects/${projectId}/attachments?entity=${entity}&ref=${reference}`)).items;
  }
  async addAttachment(projectId: string, input: { entity: string; reference: string; name: string; dataUrl: string; mime: string; size: number; dated: string; note?: string }): Promise<Attachment> {
    return this.send<Attachment>(`/api/projects/${projectId}/attachments`, 'POST', input);
  }
  async deleteAttachment(projectId: string, id: string): Promise<void> {
    await this.send(`/api/projects/${projectId}/attachments/${id}`, 'DELETE', {});
  }

  async listComments(nodeId: string): Promise<NodeComment[]> {
    return this.get<NodeComment[]>(`/api/nodes/${nodeId}/comments`);
  }
  async addComment(nodeId: string, body: string): Promise<NodeComment> {
    const res = await fetch(`${this.baseUrl}/api/nodes/${nodeId}/comments`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ body }),
    });
    if (!res.ok) throw new Error(`API ${res.status} adding comment`);
    return (await res.json()) as NodeComment;
  }

  async listBoq(projectId: string): Promise<BoqItem[]> {
    const body = await this.get<{ items: BoqItem[] }>(`/api/projects/${projectId}/boq`);
    return body.items;
  }
  async replaceBoq(
    projectId: string,
    items: Array<Pick<BoqItem, 'billNo' | 'code' | 'description' | 'unit' | 'qty' | 'rate'>>,
  ): Promise<BoqItem[]> {
    const res = await fetch(`${this.baseUrl}/api/projects/${projectId}/boq`, {
      method: 'PUT',
      headers: this.headers(true),
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error(`API ${res.status} importing BOQ`);
    return (await res.json()) as BoqItem[];
  }
  async getBoqWorkflow(projectId: string): Promise<BoqWorkflowState> {
    return this.get<BoqWorkflowState>(`/api/projects/${projectId}/boq/workflow`);
  }
  async advanceBoqWorkflow(projectId: string, role: string): Promise<BoqWorkflowState> {
    return this.send<BoqWorkflowState>(`/api/projects/${projectId}/boq/workflow/advance`, 'POST', { role });
  }
  async raiseBoqVo(projectId: string): Promise<BoqWorkflowState> {
    return this.send<BoqWorkflowState>(`/api/projects/${projectId}/boq/workflow/vo`, 'POST', {});
  }
  async listAllocations(projectId: string): Promise<Allocation[]> {
    return (await this.get<{ items: Allocation[] }>(`/api/projects/${projectId}/allocations`)).items;
  }
  async upsertAllocation(projectId: string, input: Omit<Allocation, 'id' | 'projectId'> & { id?: string }): Promise<Allocation[]> {
    return (await this.send<{ items: Allocation[] }>(`/api/projects/${projectId}/allocations`, 'POST', input)).items;
  }
  async deleteAllocation(projectId: string, id: string): Promise<Allocation[]> {
    return (await this.send<{ items: Allocation[] }>(`/api/projects/${projectId}/allocations/${id}`, 'DELETE', {})).items;
  }
  async listContractApprovals(projectId: string): Promise<ContractApproval[]> {
    return (await this.get<{ items: ContractApproval[] }>(`/api/projects/${projectId}/contracts`)).items;
  }
  async approveContract(projectId: string, key: string, role: string, value: number): Promise<ContractApproval[]> {
    return (await this.send<{ items: ContractApproval[] }>(`/api/projects/${projectId}/contracts/approve`, 'POST', { key, role, value })).items;
  }
  async listIpcs(projectId: string): Promise<Ipc[]> {
    const body = await this.get<{ items: Ipc[] }>(`/api/projects/${projectId}/ipcs`);
    return body.items;
  }
  async createIpc(projectId: string, input: { period: string; gross: number; date?: string; lines?: import('./types').IpcLine[] }): Promise<Ipc> {
    const res = await fetch(`${this.baseUrl}/api/projects/${projectId}/ipcs`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`API ${res.status} creating IPC`);
    return (await res.json()) as Ipc;
  }
  async transitionIpc(projectId: string, ipcNo: string, action: string): Promise<Ipc> {
    const res = await fetch(`${this.baseUrl}/api/projects/${projectId}/ipcs/${ipcNo}/transitions`, {
      method: 'POST',
      headers: this.headers(true),
      body: JSON.stringify({ action }),
    });
    if (!res.ok) throw new Error(`API ${res.status} transitioning IPC`);
    return (await res.json()) as Ipc;
  }

  private async send<T>(path: string, method: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(true),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
    return (await res.json()) as T;
  }

  async setIpcNote(projectId: string, ipcNo: string, note: string): Promise<Ipc> {
    return this.send<Ipc>(`/api/projects/${projectId}/ipcs/${ipcNo}/note`, 'PATCH', { note });
  }
  async listSubcontractors(projectId: string): Promise<Subcontractor[]> {
    return (await this.get<{ items: Subcontractor[] }>(`/api/projects/${projectId}/subcontractors`)).items;
  }
  async addSubcontractor(projectId: string, input: { name: string; trade: string }): Promise<Subcontractor> {
    return this.send<Subcontractor>(`/api/projects/${projectId}/subcontractors`, 'POST', input);
  }
  async updateSubcontractor(projectId: string, id: string, patch: Partial<Omit<Subcontractor, 'id' | 'projectId'>>): Promise<Subcontractor> {
    return this.send<Subcontractor>(`/api/projects/${projectId}/subcontractors/${id}`, 'PATCH', patch);
  }
  async listRars(projectId: string): Promise<Rar[]> {
    return (await this.get<{ items: Rar[] }>(`/api/projects/${projectId}/rars`)).items;
  }
  async createRar(
    projectId: string,
    input: { period: string; subcontractorId: string; contractId?: string; gross: number; date?: string; lines?: RarLine[] },
  ): Promise<Rar> {
    return this.send<Rar>(`/api/projects/${projectId}/rars`, 'POST', input);
  }
  async transitionRar(projectId: string, rarNo: string, action: string): Promise<Rar> {
    return this.send<Rar>(`/api/projects/${projectId}/rars/${rarNo}/transitions`, 'POST', { action });
  }
  async setRarFinal(projectId: string, rarNo: string, isFinal: boolean): Promise<Rar> {
    return this.send<Rar>(`/api/projects/${projectId}/rars/${rarNo}/final`, 'PATCH', { isFinal });
  }
  async setRarRecoveriesNetted(projectId: string, rarNo: string, netted: boolean): Promise<Rar> {
    return this.send<Rar>(`/api/projects/${projectId}/rars/${rarNo}/recoveries-netted`, 'PATCH', { netted });
  }
  async advanceRarChain(projectId: string, rarNo: string, role: string): Promise<Rar> {
    return this.send<Rar>(`/api/projects/${projectId}/rars/${rarNo}/chain/advance`, 'POST', { role });
  }
  async setRarNote(projectId: string, rarNo: string, note: string): Promise<Rar> {
    return this.send<Rar>(`/api/projects/${projectId}/rars/${rarNo}/note`, 'PATCH', { note });
  }
  async listRarIpcLinks(projectId: string): Promise<RarIpcLink[]> {
    return (await this.get<{ items: RarIpcLink[] }>(`/api/projects/${projectId}/rar-ipc-links`)).items;
  }
  async addRarIpcLink(
    projectId: string,
    input: { rarId: string; ipcId: string; amount: number },
  ): Promise<RarIpcLink> {
    return this.send<RarIpcLink>(`/api/projects/${projectId}/rar-ipc-links`, 'POST', input);
  }
  async listEpcs(projectId: string): Promise<Epc[]> {
    return (await this.get<{ items: Epc[] }>(`/api/projects/${projectId}/epcs`)).items;
  }
  async createEpc(projectId: string, input: { period: string; amount: number; ipcNo?: string }): Promise<Epc> {
    return this.send<Epc>(`/api/projects/${projectId}/epcs`, 'POST', input);
  }
  async listEscalationComponents(projectId: string): Promise<EscalationComponent[]> {
    return (await this.get<{ items: EscalationComponent[] }>(`/api/projects/${projectId}/escalation-indices`)).items;
  }
  async setEscalationComponents(projectId: string, components: EscalationComponent[]): Promise<void> {
    await this.send(`/api/projects/${projectId}/escalation-indices`, 'POST', { components });
  }
  async listVariations(projectId: string): Promise<Variation[]> {
    return (await this.get<{ items: Variation[] }>(`/api/projects/${projectId}/variations`)).items;
  }
  async createVariation(projectId: string, input: { title: string; type?: Variation['type']; amount?: number; boqItemId?: string; date?: string; lines?: import('./types').VariationLine[] }): Promise<Variation> {
    return this.send<Variation>(`/api/projects/${projectId}/variations`, 'POST', input);
  }
  async transitionVariation(projectId: string, voNo: string, action: string): Promise<Variation> {
    return this.send<Variation>(`/api/projects/${projectId}/variations/${voNo}/transitions`, 'POST', { action });
  }
  async listContracts(projectId: string): Promise<Contract[]> {
    return (await this.get<{ items: Contract[] }>(`/api/projects/${projectId}/contracts`)).items;
  }
  async createContract(projectId: string, input: { title: string; subcontractorId: string; scopeBills: string[]; value: number; awardDate?: string }): Promise<Contract> {
    return this.send<Contract>(`/api/projects/${projectId}/contracts`, 'POST', input);
  }
  async setContractStatus(projectId: string, contractId: string, status: ContractStatus): Promise<void> {
    await this.send(`/api/projects/${projectId}/contracts/${contractId}/status`, 'POST', { status });
  }
  async transitionEpc(projectId: string, epcNo: string, action: string): Promise<Epc> {
    return this.send<Epc>(`/api/projects/${projectId}/epcs/${epcNo}/transitions`, 'POST', { action });
  }
  async listAdvances(projectId: string): Promise<Advance[]> {
    return (await this.get<{ items: Advance[] }>(`/api/projects/${projectId}/advances`)).items;
  }
  async addAdvance(projectId: string, input: Omit<Advance, 'id' | 'projectId'>): Promise<Advance> {
    return this.send<Advance>(`/api/projects/${projectId}/advances`, 'POST', input);
  }
  async listBankGuarantees(projectId: string): Promise<BankGuarantee[]> {
    return (await this.get<{ items: BankGuarantee[] }>(`/api/projects/${projectId}/bank-guarantees`)).items;
  }
  async addBankGuarantee(projectId: string, input: Omit<BankGuarantee, 'id' | 'projectId'>): Promise<BankGuarantee> {
    return this.send<BankGuarantee>(`/api/projects/${projectId}/bank-guarantees`, 'POST', input);
  }
  async setBankGuaranteeStatus(projectId: string, id: string, status: BankGuarantee['status']): Promise<BankGuarantee[]> {
    return (await this.send<{ items: BankGuarantee[] }>(`/api/projects/${projectId}/bank-guarantees/${id}`, 'POST', { status })).items;
  }
  async listDistributions(projectId: string): Promise<Distribution[]> {
    return (await this.get<{ items: Distribution[] }>(`/api/projects/${projectId}/distributions`)).items;
  }
  async setDistribution(projectId: string, dist: Distribution): Promise<Distribution> {
    return this.send<Distribution>(`/api/projects/${projectId}/distributions`, 'PUT', dist);
  }
  async replaceSchedule(projectId: string, rows: Array<Omit<ScheduleActivity, 'id' | 'projectId'>>): Promise<ScheduleActivity[]> {
    return (await this.send<{ items: ScheduleActivity[] }>(`/api/projects/${projectId}/schedule`, 'PUT', { rows })).items;
  }
  async importScurve(projectId: string, points: MonthlySeriesPoint[]): Promise<MonthlySeriesPoint[]> {
    return (await this.send<{ items: MonthlySeriesPoint[] }>(`/api/projects/${projectId}/scurve`, 'PUT', { points })).items;
  }
  async getScheduleWorkflow(projectId: string): Promise<BaselineWorkflowState> {
    return this.get<BaselineWorkflowState>(`/api/projects/${projectId}/schedule/workflow`);
  }
  async advanceScheduleWorkflow(projectId: string, role: string): Promise<BaselineWorkflowState> {
    return this.send<BaselineWorkflowState>(`/api/projects/${projectId}/schedule/workflow/advance`, 'POST', { role });
  }
  async amendScheduleBaseline(projectId: string): Promise<BaselineWorkflowState> {
    return this.send<BaselineWorkflowState>(`/api/projects/${projectId}/schedule/workflow/amend`, 'POST', {});
  }
  async listOverheads(projectId: string): Promise<OverheadLine[]> {
    return (await this.get<{ items: OverheadLine[] }>(`/api/projects/${projectId}/overheads`)).items;
  }
  async upsertOverhead(projectId: string, input: Omit<OverheadLine, 'id' | 'projectId'> & { id?: string }): Promise<OverheadLine[]> {
    return (await this.send<{ items: OverheadLine[] }>(`/api/projects/${projectId}/overheads`, 'POST', input)).items;
  }
  async deleteOverhead(projectId: string, id: string): Promise<OverheadLine[]> {
    return (await this.send<{ items: OverheadLine[] }>(`/api/projects/${projectId}/overheads/${id}`, 'DELETE', {})).items;
  }
  async listSchedule(projectId: string): Promise<ScheduleActivity[]> {
    return (await this.get<{ items: ScheduleActivity[] }>(`/api/projects/${projectId}/schedule`)).items;
  }
  async listMonthlySeries(projectId: string): Promise<MonthlySeriesPoint[]> {
    return (await this.get<{ points: MonthlySeriesPoint[] }>(`/api/projects/${projectId}/scurve`)).points;
  }
  async setMonthlyActual(projectId: string, month: string, actual: number): Promise<MonthlySeriesPoint[]> {
    return (await this.send<{ points: MonthlySeriesPoint[] }>(
      `/api/projects/${projectId}/scurve/${month}`, 'PATCH', { actual },
    )).points;
  }
  async listResources(projectId: string): Promise<Resource[]> {
    return (await this.get<{ items: Resource[] }>(`/api/projects/${projectId}/resources`)).items;
  }
  async addResource(projectId: string, input: Omit<Resource, 'id' | 'projectId'>): Promise<Resource> {
    return this.send<Resource>(`/api/projects/${projectId}/resources`, 'POST', input);
  }
  async listBoqWbs(projectId: string): Promise<BoqWbsLink[]> {
    return (await this.get<{ items: BoqWbsLink[] }>(`/api/projects/${projectId}/boq-wbs`)).items;
  }
  async setBoqWbs(projectId: string, link: BoqWbsLink): Promise<BoqWbsLink> {
    return this.send<BoqWbsLink>(`/api/projects/${projectId}/boq-wbs`, 'PUT', link);
  }
  async listBoqMaterial(projectId: string): Promise<BoqMaterialLink[]> {
    return (await this.get<{ items: BoqMaterialLink[] }>(`/api/projects/${projectId}/boq-material`)).items;
  }
  async setBoqMaterial(projectId: string, link: BoqMaterialLink): Promise<BoqMaterialLink> {
    return this.send<BoqMaterialLink>(`/api/projects/${projectId}/boq-material`, 'PUT', link);
  }
  async listReceipts(projectId: string): Promise<FinancialReceipt[]> {
    return (await this.get<{ items: FinancialReceipt[] }>(`/api/projects/${projectId}/receipts`)).items;
  }
  async addReceipt(projectId: string, input: Omit<FinancialReceipt, 'id' | 'projectId'>): Promise<FinancialReceipt> {
    return this.send<FinancialReceipt>(`/api/projects/${projectId}/receipts`, 'POST', input);
  }
  async listPayments(projectId: string): Promise<FinancialPayment[]> {
    return (await this.get<{ items: FinancialPayment[] }>(`/api/projects/${projectId}/payments`)).items;
  }
  async addPayment(projectId: string, input: Omit<FinancialPayment, 'id' | 'projectId'>): Promise<FinancialPayment> {
    return this.send<FinancialPayment>(`/api/projects/${projectId}/payments`, 'POST', input);
  }
  async listLiabilities(projectId: string): Promise<FinancialLiability[]> {
    return (await this.get<{ items: FinancialLiability[] }>(`/api/projects/${projectId}/liabilities`)).items;
  }
  async addLiability(projectId: string, input: Omit<FinancialLiability, 'id' | 'projectId'>): Promise<FinancialLiability> {
    return this.send<FinancialLiability>(`/api/projects/${projectId}/liabilities`, 'POST', input);
  }
  async listSuppliers(projectId: string): Promise<Supplier[]> {
    return (await this.get<{ items: Supplier[] }>(`/api/projects/${projectId}/suppliers`)).items;
  }
  async addSupplier(projectId: string, input: Omit<Supplier, 'id' | 'projectId'>): Promise<Supplier> {
    return this.send<Supplier>(`/api/projects/${projectId}/suppliers`, 'POST', input);
  }
  async listDemands(projectId: string): Promise<Demand[]> {
    return (await this.get<{ items: Demand[] }>(`/api/projects/${projectId}/demands`)).items;
  }
  async createDemand(projectId: string, input: { type: DemandType; justification: string; items: DemandItem[] }): Promise<Demand> {
    return this.send<Demand>(`/api/projects/${projectId}/demands`, 'POST', input);
  }
  async advanceDemand(projectId: string, demandNo: string, role: string): Promise<Demand> {
    return this.send<Demand>(`/api/projects/${projectId}/demands/${demandNo}/advance`, 'POST', { role });
  }
  async listPurchaseOrders(projectId: string): Promise<PurchaseOrder[]> {
    return (await this.get<{ items: PurchaseOrder[] }>(`/api/projects/${projectId}/purchase-orders`)).items;
  }
  async createPurchaseOrder(projectId: string, input: { demandId: string; supplierId: string }): Promise<PurchaseOrder> {
    return this.send<PurchaseOrder>(`/api/projects/${projectId}/purchase-orders`, 'POST', input);
  }
  async listCrvs(projectId: string): Promise<Crv[]> {
    return (await this.get<{ items: Crv[] }>(`/api/projects/${projectId}/crvs`)).items;
  }
  async createCrv(projectId: string, input: { poId: string; received: CrvLine[] }): Promise<Crv> {
    return this.send<Crv>(`/api/projects/${projectId}/crvs`, 'POST', input);
  }
  async listProcPayments(projectId: string): Promise<ProcPayment[]> {
    return (await this.get<{ items: ProcPayment[] }>(`/api/projects/${projectId}/proc-payments`)).items;
  }
  async createProcPayment(projectId: string, input: { refType: 'po' | 'hire'; refId: string; amount: number; chainType: ProcChainType }): Promise<ProcPayment> {
    return this.send<ProcPayment>(`/api/projects/${projectId}/proc-payments`, 'POST', input);
  }
  async advanceProcPayment(projectId: string, paymentNo: string, role: string): Promise<ProcPayment> {
    return this.send<ProcPayment>(`/api/projects/${projectId}/proc-payments/${paymentNo}/advance`, 'POST', { role });
  }
  async listHires(projectId: string): Promise<MachineryHire[]> {
    return (await this.get<{ items: MachineryHire[] }>(`/api/projects/${projectId}/hires`)).items;
  }
  async createHire(projectId: string, input: { supplierId: string; rateBasis: MachineryHire['rateBasis']; rate: number }): Promise<MachineryHire> {
    return this.send<MachineryHire>(`/api/projects/${projectId}/hires`, 'POST', input);
  }
  async addHireUtilization(projectId: string, hireNo: string, entry: { dated: string; units: number }): Promise<MachineryHire> {
    return this.send<MachineryHire>(`/api/projects/${projectId}/hires/${hireNo}/utilization`, 'POST', entry);
  }
  async listAudit(): Promise<AuditEntry[]> {
    return (await this.get<{ items: AuditEntry[] }>(`/api/audit`)).items;
  }
  async listInventory(projectId: string): Promise<InventoryItem[]> {
    return (await this.get<{ items: InventoryItem[] }>(`/api/projects/${projectId}/inventory`)).items;
  }
  async listProgress(projectId: string): Promise<ProgressUpdate[]> {
    return (await this.get<{ items: ProgressUpdate[] }>(`/api/projects/${projectId}/progress`)).items;
  }
  async upsertProgress(projectId: string, input: { boqItemId: string; period: string; executedQty: number; role: string; id?: string }): Promise<ProgressUpdate[]> {
    return (await this.send<{ items: ProgressUpdate[] }>(`/api/projects/${projectId}/progress`, 'POST', input)).items;
  }
  async validateProgress(projectId: string, id: string, role: string): Promise<ProgressUpdate[]> {
    return (await this.send<{ items: ProgressUpdate[] }>(`/api/projects/${projectId}/progress/${id}/validate`, 'POST', { role })).items;
  }
  async listHr(nodeId: string): Promise<HrPosting[]> {
    return (await this.get<{ items: HrPosting[] }>(`/api/nodes/${nodeId}/hr`)).items;
  }
  async listAllHr(): Promise<HrPosting[]> {
    return (await this.get<{ items: HrPosting[] }>(`/api/hr`)).items;
  }
  async upsertHr(nodeId: string, input: Omit<HrPosting, 'id' | 'nodeId'> & { id?: string }): Promise<HrPosting[]> {
    return (await this.send<{ items: HrPosting[] }>(`/api/nodes/${nodeId}/hr`, 'POST', input)).items;
  }
  async deleteHr(nodeId: string, id: string): Promise<HrPosting[]> {
    return (await this.send<{ items: HrPosting[] }>(`/api/nodes/${nodeId}/hr/${id}`, 'DELETE', {})).items;
  }
  async listHrUnits(nodeId: string): Promise<HrUnit[]> {
    return (await this.get<{ items: HrUnit[] }>(`/api/nodes/${nodeId}/hr-units`)).items;
  }
  async listAllHrUnits(): Promise<HrUnit[]> {
    return (await this.get<{ items: HrUnit[] }>(`/api/hr-units`)).items;
  }
  async upsertHrUnit(nodeId: string, input: Omit<HrUnit, 'id' | 'nodeId'> & { id?: string }): Promise<HrUnit[]> {
    return (await this.send<{ items: HrUnit[] }>(`/api/nodes/${nodeId}/hr-units`, 'POST', input)).items;
  }
  async deleteHrUnit(nodeId: string, id: string): Promise<HrUnit[]> {
    return (await this.send<{ items: HrUnit[] }>(`/api/nodes/${nodeId}/hr-units/${id}`, 'DELETE', {})).items;
  }
  async listPeople(nodeId: string): Promise<HrPerson[]> {
    return (await this.get<{ items: HrPerson[] }>(`/api/nodes/${nodeId}/people`)).items;
  }
  async listAllPeople(): Promise<HrPerson[]> {
    return (await this.get<{ items: HrPerson[] }>(`/api/people`)).items;
  }
  async upsertPerson(nodeId: string, input: Omit<HrPerson, 'id' | 'nodeId'> & { id?: string }): Promise<HrPerson[]> {
    return (await this.send<{ items: HrPerson[] }>(`/api/nodes/${nodeId}/people`, 'POST', input)).items;
  }
  async deletePerson(nodeId: string, id: string): Promise<HrPerson[]> {
    return (await this.send<{ items: HrPerson[] }>(`/api/nodes/${nodeId}/people/${id}`, 'DELETE', {})).items;
  }
  async listRequisitions(nodeId: string): Promise<HrRequisition[]> {
    return (await this.get<{ items: HrRequisition[] }>(`/api/nodes/${nodeId}/requisitions`)).items;
  }
  async upsertRequisition(nodeId: string, input: Omit<HrRequisition, 'id' | 'nodeId' | 'raisedAt'> & { id?: string }): Promise<HrRequisition[]> {
    return (await this.send<{ items: HrRequisition[] }>(`/api/nodes/${nodeId}/requisitions`, 'POST', input)).items;
  }
  async advanceRequisition(nodeId: string, id: string): Promise<HrRequisition[]> {
    return (await this.send<{ items: HrRequisition[] }>(`/api/nodes/${nodeId}/requisitions/${id}/advance`, 'POST', {})).items;
  }
  async deleteRequisition(nodeId: string, id: string): Promise<HrRequisition[]> {
    return (await this.send<{ items: HrRequisition[] }>(`/api/nodes/${nodeId}/requisitions/${id}`, 'DELETE', {})).items;
  }
  async listCredentials(nodeId: string): Promise<HrCredential[]> {
    return (await this.get<{ items: HrCredential[] }>(`/api/nodes/${nodeId}/credentials`)).items;
  }
  async upsertCredential(nodeId: string, input: Omit<HrCredential, 'id' | 'nodeId'> & { id?: string }): Promise<HrCredential[]> {
    return (await this.send<{ items: HrCredential[] }>(`/api/nodes/${nodeId}/credentials`, 'POST', input)).items;
  }
  async deleteCredential(nodeId: string, id: string): Promise<HrCredential[]> {
    return (await this.send<{ items: HrCredential[] }>(`/api/nodes/${nodeId}/credentials/${id}`, 'DELETE', {})).items;
  }
  async listTransfersForNode(nodeId: string): Promise<HrTransfer[]> {
    return (await this.get<{ items: HrTransfer[] }>(`/api/nodes/${nodeId}/transfers`)).items;
  }
  async raiseTransfer(input: Omit<HrTransfer, 'id' | 'stage' | 'raisedAt'>): Promise<HrTransfer[]> {
    return (await this.send<{ items: HrTransfer[] }>(`/api/transfers`, 'POST', input)).items;
  }
  async advanceTransfer(id: string): Promise<HrTransfer[]> {
    return (await this.send<{ items: HrTransfer[] }>(`/api/transfers/${id}/advance`, 'POST', {})).items;
  }
  async rejectTransfer(id: string): Promise<HrTransfer[]> {
    return (await this.send<{ items: HrTransfer[] }>(`/api/transfers/${id}/reject`, 'POST', {})).items;
  }
  async effectTransfer(id: string): Promise<HrTransfer[]> {
    return (await this.send<{ items: HrTransfer[] }>(`/api/transfers/${id}/effect`, 'POST', {})).items;
  }
  async deleteTransfer(id: string): Promise<HrTransfer[]> {
    return (await this.send<{ items: HrTransfer[] }>(`/api/transfers/${id}`, 'DELETE', {})).items;
  }
  async listEstablishmentVersions(nodeId: string): Promise<HrEstablishmentVersion[]> {
    return (await this.get<{ items: HrEstablishmentVersion[] }>(`/api/nodes/${nodeId}/establishment-versions`)).items;
  }
  async snapshotEstablishment(nodeId: string, label: string): Promise<HrEstablishmentVersion[]> {
    return (await this.send<{ items: HrEstablishmentVersion[] }>(`/api/nodes/${nodeId}/establishment-versions`, 'POST', { label })).items;
  }
  async sanctionEstablishmentVersion(nodeId: string, id: string, approvedBy: string): Promise<HrEstablishmentVersion[]> {
    return (await this.send<{ items: HrEstablishmentVersion[] }>(`/api/nodes/${nodeId}/establishment-versions/${id}/sanction`, 'POST', { approvedBy })).items;
  }
  async deleteEstablishmentVersion(nodeId: string, id: string): Promise<HrEstablishmentVersion[]> {
    return (await this.send<{ items: HrEstablishmentVersion[] }>(`/api/nodes/${nodeId}/establishment-versions/${id}`, 'DELETE', {})).items;
  }
  async upsertInventory(projectId: string, input: Omit<InventoryItem, 'id' | 'projectId'> & { id?: string }): Promise<InventoryItem[]> {
    return (await this.send<{ items: InventoryItem[] }>(`/api/projects/${projectId}/inventory`, 'POST', input)).items;
  }
  async listPol(projectId: string): Promise<PolRecord[]> {
    return (await this.get<{ items: PolRecord[] }>(`/api/projects/${projectId}/pol`)).items;
  }
  async addPol(projectId: string, input: Omit<PolRecord, 'id' | 'projectId'>): Promise<PolRecord[]> {
    return (await this.send<{ items: PolRecord[] }>(`/api/projects/${projectId}/pol`, 'POST', input)).items;
  }
  async listFixedAssets(projectId: string): Promise<FixedAsset[]> {
    return (await this.get<{ items: FixedAsset[] }>(`/api/projects/${projectId}/fixed-assets`)).items;
  }
  async addFixedAsset(projectId: string, input: Omit<FixedAsset, 'id' | 'projectId'>): Promise<FixedAsset[]> {
    return (await this.send<{ items: FixedAsset[] }>(`/api/projects/${projectId}/fixed-assets`, 'POST', input)).items;
  }
  async listMaintenance(projectId: string): Promise<MaintenanceRequest[]> {
    return (await this.get<{ items: MaintenanceRequest[] }>(`/api/projects/${projectId}/maintenance`)).items;
  }
  async createMaintenance(projectId: string, input: { asset: string; description: string; estCost: number }): Promise<MaintenanceRequest> {
    return this.send<MaintenanceRequest>(`/api/projects/${projectId}/maintenance`, 'POST', input);
  }
  async advanceMaintenance(projectId: string, reqNo: string, role: string): Promise<MaintenanceRequest> {
    return this.send<MaintenanceRequest>(`/api/projects/${projectId}/maintenance/${reqNo}/advance`, 'POST', { role });
  }
  async getPeriodMap(projectId: string): Promise<Record<string, string>> {
    return (await this.get<{ map: Record<string, string> }>(`/api/projects/${projectId}/period-map`)).map;
  }
  async setPeriodMapping(projectId: string, ipcNo: string, month: string): Promise<Record<string, string>> {
    return (await this.send<{ map: Record<string, string> }>(`/api/projects/${projectId}/period-map`, 'PUT', { ipcNo, month })).map;
  }
  async listProductionRuns(projectId: string): Promise<ProductionRun[]> {
    return (await this.get<{ items: ProductionRun[] }>(`/api/projects/${projectId}/production`)).items;
  }
  async createProductionRun(projectId: string, input: Omit<ProductionRun, 'id' | 'projectId'>): Promise<ProductionRun> {
    return this.send<ProductionRun>(`/api/projects/${projectId}/production`, 'POST', input);
  }
  async listMaterialIssues(projectId: string): Promise<MaterialIssue[]> {
    return (await this.get<{ items: MaterialIssue[] }>(`/api/projects/${projectId}/material-issues`)).items;
  }
  async createMaterialIssue(projectId: string, input: Omit<MaterialIssue, 'id' | 'projectId'>): Promise<MaterialIssue> {
    return this.send<MaterialIssue>(`/api/projects/${projectId}/material-issues`, 'POST', input);
  }
  async setMaterialRecovered(projectId: string, id: string, recovered: number): Promise<MaterialIssue[]> {
    return (await this.send<{ items: MaterialIssue[] }>(`/api/projects/${projectId}/material-issues/${id}/recovered`, 'PATCH', { recovered })).items;
  }
  async getMappingWorkflow(projectId: string): Promise<BaselineWorkflowState> {
    return this.get<BaselineWorkflowState>(`/api/projects/${projectId}/mapping/workflow`);
  }
  async advanceMappingWorkflow(projectId: string, role: string): Promise<BaselineWorkflowState> {
    return this.send<BaselineWorkflowState>(`/api/projects/${projectId}/mapping/workflow/advance`, 'POST', { role });
  }
  async amendMapping(projectId: string): Promise<BaselineWorkflowState> {
    return this.send<BaselineWorkflowState>(`/api/projects/${projectId}/mapping/workflow/amend`, 'POST', {});
  }
  async listSalients(projectId: string): Promise<Salient[]> {
    return (await this.get<{ items: Salient[] }>(`/api/projects/${projectId}/salients`)).items;
  }
  async upsertSalient(projectId: string, input: { id?: string; label: string; value: string }): Promise<Salient> {
    return this.send<Salient>(`/api/projects/${projectId}/salients`, 'POST', input);
  }
  async deleteSalient(projectId: string, id: string): Promise<void> {
    await this.send(`/api/projects/${projectId}/salients/${id}`, 'DELETE', {});
  }
  async reverseIpc(projectId: string, ipcNo: string): Promise<Ipc> {
    return this.send<Ipc>(`/api/projects/${projectId}/ipcs/${ipcNo}/reverse`, 'POST', {});
  }
}

  // Build-time selection: VITE_DATA_MODE = 'api' | 'local' (default local).
export function makeDataProvider(): DataProvider {
  // Both modes run the same provider logic; api mode swaps the backing store
  // to the remote KV (hydrated by initDataBackend before first use).
  return new LocalDataProvider();
}

/**
 * In api mode, point the provider's store at the backend document API and
 * hydrate it. Call once during app bootstrap before reading data. A no-op in
 * local mode. Returns the active mode for diagnostics.
 */
export async function initDataBackend(): Promise<'api' | 'local'> {
  const mode = (import.meta.env.VITE_DATA_MODE ?? 'local') as 'api' | 'local';
  if (mode === 'api') {
    const base = import.meta.env.VITE_API_BASE_URL ?? '';
    const user = import.meta.env.VITE_API_USER ?? 'demo';
    const remote = new RemoteKvStore(base, user);
    await remote.hydrate();
    setKvStore(remote);
  }
  return mode;
}
