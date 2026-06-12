import {
  DataProvider, OrgNode, Project, NodeComment, BoqItem, Ipc,
  Subcontractor, Rar, RarIpcLink, Epc, Advance, Distribution,
  ScheduleActivity, MonthlySeriesPoint, Resource, BoqWbsLink, BoqMaterialLink,
  FinancialReceipt, FinancialPayment, FinancialLiability,
  Supplier, Demand, DemandItem, DemandType, PurchaseOrder, Crv, CrvLine,
  ProcPayment, ProcChainType, MachineryHire, AuditEntry,
  ProductionRun, MaterialIssue, Salient, ProjectPhoto,
} from './types';
import { LocalDataProvider } from './LocalDataProvider';

// Talks to the on-prem backend per FGEHA_NLC_API_Contract.md. Stubbed here;
// the full build maps each method to a contract endpoint, sends the AD/SSO
// token, and surfaces the standard error envelope + 409 optimistic-lock.
export class ApiDataProvider implements DataProvider {
  readonly mode = 'api' as const;
  constructor(private baseUrl: string) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { credentials: 'include' });
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
  async createProject(input: { pdHqId: string; name: string; clientName: string; contractValue: string; plannedPct: number; actualPct: number }): Promise<Project> {
    return this.send<Project>('/api/projects', 'POST', input);
  }
  async updateProject(projectId: string, patch: Partial<Project>): Promise<Project> {
    return this.send<Project>(`/api/projects/${projectId}`, 'PATCH', patch);
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

  async listComments(nodeId: string): Promise<NodeComment[]> {
    return this.get<NodeComment[]>(`/api/nodes/${nodeId}/comments`);
  }
  async addComment(nodeId: string, body: string): Promise<NodeComment> {
    const res = await fetch(`${this.baseUrl}/api/nodes/${nodeId}/comments`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
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
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error(`API ${res.status} importing BOQ`);
    return (await res.json()) as BoqItem[];
  }
  async listIpcs(projectId: string): Promise<Ipc[]> {
    const body = await this.get<{ items: Ipc[] }>(`/api/projects/${projectId}/ipcs`);
    return body.items;
  }
  async createIpc(projectId: string, input: { period: string; gross: number }): Promise<Ipc> {
    const res = await fetch(`${this.baseUrl}/api/projects/${projectId}/ipcs`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`API ${res.status} creating IPC`);
    return (await res.json()) as Ipc;
  }
  async transitionIpc(projectId: string, ipcNo: string, action: string): Promise<Ipc> {
    const res = await fetch(`${this.baseUrl}/api/projects/${projectId}/ipcs/${ipcNo}/transitions`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) throw new Error(`API ${res.status} transitioning IPC`);
    return (await res.json()) as Ipc;
  }

  private async send<T>(path: string, method: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
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
  async listRars(projectId: string): Promise<Rar[]> {
    return (await this.get<{ items: Rar[] }>(`/api/projects/${projectId}/rars`)).items;
  }
  async createRar(
    projectId: string,
    input: { period: string; subcontractorId: string; gross: number },
  ): Promise<Rar> {
    return this.send<Rar>(`/api/projects/${projectId}/rars`, 'POST', input);
  }
  async transitionRar(projectId: string, rarNo: string, action: string): Promise<Rar> {
    return this.send<Rar>(`/api/projects/${projectId}/rars/${rarNo}/transitions`, 'POST', { action });
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
  async createEpc(projectId: string, input: { period: string; amount: number }): Promise<Epc> {
    return this.send<Epc>(`/api/projects/${projectId}/epcs`, 'POST', input);
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
  const mode = import.meta.env.VITE_DATA_MODE ?? 'local';
  if (mode === 'api') {
    return new ApiDataProvider(import.meta.env.VITE_API_BASE_URL ?? '');
  }
  return new LocalDataProvider();
}
