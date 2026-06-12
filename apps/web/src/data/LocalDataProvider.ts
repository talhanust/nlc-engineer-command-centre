import {
  DataProvider, OrgNode, Project, NodeComment, BoqItem, Ipc,
  Subcontractor, Rar, RarIpcLink, Epc, Advance, Distribution,
  ScheduleActivity, MonthlySeriesPoint, Resource, BoqWbsLink, BoqMaterialLink,
  FinancialReceipt, FinancialPayment, FinancialLiability,
  Supplier, Demand, DemandItem, DemandType, PurchaseOrder, Crv, CrvLine,
  ProcPayment, ProcChainType, MachineryHire, AuditEntry,
  ProductionRun, MaterialIssue, Salient, ProjectPhoto,
} from './types';
import { itemAmount } from '../domain/boq';
import { applyAction, computeNet, IPC_PIPELINE } from '../domain/ipc';
import { applyRarAction } from '../domain/rar';
import { synthSeries } from '../domain/scurve';
import { DEMAND_CHAIN, checkAdvance } from '../domain/chains';

// Client-only provider for the static GitHub Pages demo. Single-user, no
// server. In the full build this seeds from prototype/demo-data/*.json and
// persists to localStorage; here it returns a representative NLC portfolio.

interface Seed {
  id: string; name: string; pdHqId: string; client: string;
  cv: string; billed: string; received: string; planned: number; actual: number;
}

// Client names (FGEHA, CDA, NHA, …) are PROJECT clients — never the app brand.
const SEED: Seed[] = [
  { id: 'proj-f14f15', name: 'F-14/F-15 Islamabad', pdHqId: 'pd-north', client: 'FGEHA', cv: '19284461163', billed: '11200000000', received: '9800000000', planned: 62, actual: 58 },
  { id: 'proj-bahria', name: 'Bahria Enclave Roads', pdHqId: 'pd-north', client: 'Bahria Town', cv: '12450000000', billed: '7100000000', received: '6500000000', planned: 55, actual: 54 },
  { id: 'proj-e12', name: 'E-12 Infrastructure', pdHqId: 'pd-centre', client: 'CDA', cv: '8640000000', billed: '3200000000', received: '2400000000', planned: 40, actual: 25 },
  { id: 'proj-rwp-ring', name: 'Rawalpindi Ring Road', pdHqId: 'pd-centre', client: 'RDA', cv: '46000000000', billed: '22000000000', received: '18500000000', planned: 48, actual: 45 },
  { id: 'proj-m2-rehab', name: 'M-2 Rehabilitation', pdHqId: 'pd-kpk', client: 'NHA', cv: '30200000000', billed: '20500000000', received: '17800000000', planned: 70, actual: 66 },
  { id: 'proj-swat-expr', name: 'Swat Expressway Ph-II', pdHqId: 'pd-kpk', client: 'KPHA', cv: '54000000000', billed: '15000000000', received: '12000000000', planned: 35, actual: 22 },
  { id: 'proj-khi-water', name: 'Karachi Water Supply K-IV', pdHqId: 'pd-sindh', client: 'SIDC', cv: '52800000000', billed: '24000000000', received: '21000000000', planned: 44, actual: 41 },
  { id: 'proj-gwadar', name: 'Gwadar Free Zone Works', pdHqId: 'pd-bln', client: 'GDA', cv: '7300000000', billed: '1900000000', received: '1200000000', planned: 20, actual: 11 },
];

const NODES: OrgNode[] = [
  { id: 'hq-nlc', name: 'HQ NLC', type: 'hq', parentId: null },
  { id: 'hq-engrs', name: 'HQ Engineers', type: 'hq_engrs', parentId: 'hq-nlc' },
  { id: 'pd-north', name: 'HQ PD North', type: 'pd_hq', parentId: 'hq-engrs' },
  { id: 'pd-centre', name: 'HQ PD Centre', type: 'pd_hq', parentId: 'hq-engrs' },
  { id: 'pd-kpk', name: 'HQ PD KPK', type: 'pd_hq', parentId: 'hq-engrs' },
  { id: 'pd-sindh', name: 'HQ PD Sindh', type: 'pd_hq', parentId: 'hq-engrs' },
  { id: 'pd-bln', name: 'HQ PD Bln', type: 'pd_hq', parentId: 'hq-engrs' },
  ...SEED.map((s): OrgNode => ({ id: s.id, name: s.name, type: 'project', parentId: s.pdHqId })),
];

const COORDS: Record<string, { lat: number; lng: number; location: string }> = {
  'proj-f14f15': { lat: 33.69, lng: 73.06, location: 'Islamabad' },
  'proj-bahria': { lat: 33.72, lng: 73.18, location: 'Bahria Enclave, Islamabad' },
  'proj-e12': { lat: 33.70, lng: 72.95, location: 'E-12, Islamabad' },
  'proj-rwp-ring': { lat: 33.60, lng: 73.04, location: 'Rawalpindi' },
  'proj-m2-rehab': { lat: 32.93, lng: 73.72, location: 'M-2 Motorway' },
  'proj-swat-expr': { lat: 34.80, lng: 72.36, location: 'Swat' },
  'proj-khi-water': { lat: 24.86, lng: 67.00, location: 'Karachi' },
  'proj-gwadar': { lat: 25.13, lng: 62.32, location: 'Gwadar' },
};
const PROJECTS: Project[] = SEED.map((s) => ({
  id: s.id, pdHqId: s.pdHqId, clientName: s.client,
  contractValue: s.cv, billedToDate: s.billed, receivedToDate: s.received,
  plannedPct: s.planned, actualPct: s.actual,
  lat: COORDS[s.id]?.lat, lng: COORDS[s.id]?.lng, location: COORDS[s.id]?.location,
}));

export class LocalDataProvider implements DataProvider {
  readonly mode = 'local' as const;
  async listNodes(): Promise<OrgNode[]> {
    const nodes = readJson<OrgNode[]>(nodesKey, () => NODES);
    const archived = new Set(this.readProjectsRaw().filter((p) => p.archived).map((p) => p.id));
    return nodes.filter((n) => !(n.type === 'project' && archived.has(n.id)));
  }
  async listProjects(): Promise<Project[]> {
    return this.readProjectsRaw().filter((p) => !p.archived);
  }
  private readProjectsRaw(): Project[] {
    return readJson<Project[]>(projectsKey, () => PROJECTS);
  }
  async listArchivedProjects(): Promise<Project[]> {
    return this.readProjectsRaw().filter((p) => p.archived);
  }

  async createProject(input: {
    pdHqId: string; name: string; clientName: string;
    contractValue: string; plannedPct: number; actualPct: number;
  }): Promise<Project> {
    const nodes = readJson<OrgNode[]>(nodesKey, () => NODES);
    const projects = this.readProjectsRaw();
    const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'project';
    let id = `proj-${slug}`;
    let n = 2;
    while (nodes.some((x) => x.id === id) || projects.some((x) => x.id === id)) id = `proj-${slug}-${n++}`;
    const node: OrgNode = { id, name: sanitize(input.name), type: 'project', parentId: input.pdHqId };
    const project: Project = {
      id, pdHqId: input.pdHqId, clientName: sanitize(input.clientName),
      contractValue: input.contractValue, billedToDate: '0', receivedToDate: '0',
      plannedPct: input.plannedPct, actualPct: input.actualPct,
    };
    nodes.push(node); projects.push(project);
    writeJson(nodesKey, nodes); writeJson(projectsKey, projects);
    audit(id, 'create', 'Project', node.name, `under ${input.pdHqId}`);
    return project;
  }

  async updateProject(projectId: string, patch: Partial<Project>): Promise<Project> {
    const projects = this.readProjectsRaw();
    const p = projects.find((x) => x.id === projectId);
    if (!p) throw new Error(`Project ${projectId} not found`);
    Object.assign(p, patch);
    if (patch.clientName) p.clientName = sanitize(patch.clientName);
    writeJson(projectsKey, projects);
    audit(projectId, 'update', 'Project', projectId, Object.keys(patch).join(', '));
    return p;
  }

  async archiveProject(projectId: string): Promise<void> {
    const projects = this.readProjectsRaw();
    const p = projects.find((x) => x.id === projectId);
    if (p) { p.archived = true; writeJson(projectsKey, projects); audit(projectId, 'archive', 'Project', projectId); }
  }
  async restoreProject(projectId: string): Promise<void> {
    const projects = this.readProjectsRaw();
    const p = projects.find((x) => x.id === projectId);
    if (p) { p.archived = false; writeJson(projectsKey, projects); audit(projectId, 'restore', 'Project', projectId); }
  }

  async addPdHq(name: string): Promise<OrgNode> {
    const nodes = readJson<OrgNode[]>(nodesKey, () => NODES);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) || 'pd';
    let id = `pd-${slug}`;
    let n = 2;
    while (nodes.some((x) => x.id === id)) id = `pd-${slug}-${n++}`;
    const node: OrgNode = { id, name: sanitize(name), type: 'pd_hq', parentId: 'hq-engrs' };
    nodes.push(node);
    writeJson(nodesKey, nodes);
    return node;
  }

  async listPhotos(projectId: string): Promise<ProjectPhoto[]> {
    return readJson(photoKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_PHOTOS : []));
  }
  async addPhoto(projectId: string, input: { url: string; caption: string; dated: string }): Promise<ProjectPhoto> {
    const all = readJson<ProjectPhoto[]>(photoKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_PHOTOS : []));
    const photo: ProjectPhoto = { id: `ph-${projectId}-${Date.now()}`, projectId, url: input.url.trim(), caption: sanitize(input.caption), dated: input.dated };
    all.unshift(photo);
    writeJson(photoKey(projectId), all);
    return photo;
  }
  async deletePhoto(projectId: string, id: string): Promise<void> {
    const all = readJson<ProjectPhoto[]>(photoKey(projectId), () => []);
    writeJson(photoKey(projectId), all.filter((p) => p.id !== id));
  }

  async listComments(nodeId: string): Promise<NodeComment[]> {
    return readComments(nodeId);
  }
  async addComment(nodeId: string, body: string): Promise<NodeComment> {
    const c: NodeComment = {
      id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nodeId,
      author: 'You',
      body: sanitize(body),
      createdAt: new Date().toISOString(),
    };
    const all = readComments(nodeId);
    all.unshift(c);
    try {
      localStorage.setItem(commentKey(nodeId), JSON.stringify(all));
    } catch {
      /* ignore */
    }
    return c;
  }

  // ---- Commercial: BOQ ----
  async listBoq(projectId: string): Promise<BoqItem[]> {
    return readBoq(projectId);
  }
  async replaceBoq(
    projectId: string,
    items: Array<Pick<BoqItem, 'billNo' | 'code' | 'description' | 'unit' | 'qty' | 'rate'>>,
  ): Promise<BoqItem[]> {
    const rows: BoqItem[] = items.map((r, i) => ({
      id: `boq-${projectId}-${i}`,
      projectId,
      billNo: r.billNo,
      code: r.code,
      description: r.description,
      unit: r.unit,
      qty: r.qty,
      rate: r.rate,
      amount: itemAmount(r.qty, r.rate),
    }));
    writeJson(boqKey(projectId), rows);
    return rows;
  }

  // ---- Commercial: IPC ----
  async listIpcs(projectId: string): Promise<Ipc[]> {
    return readIpcs(projectId);
  }
  async createIpc(projectId: string, input: { period: string; gross: number }): Promise<Ipc> {
    const all = readIpcs(projectId);
    const seq = all.reduce((m, i) => Math.max(m, i.seq), 0) + 1;
    const prevCum = all.reduce((m, i) => Math.max(m, i.cumGross), 0);
    const ipc: Ipc = {
      id: `ipc-${projectId}-${seq}`,
      projectId,
      ipcNo: `IPC-${String(seq).padStart(2, '0')}`,
      seq,
      period: input.period,
      status: 'draft',
      gross: input.gross,
      netPayable: computeNet(input.gross),
      cumGross: prevCum + input.gross,
    };
    all.push(ipc);
    writeJson(ipcKey(projectId), all);
    return ipc;
  }
  async transitionIpc(projectId: string, ipcNo: string, action: string): Promise<Ipc> {
    const all = readIpcs(projectId);
    const ipc = all.find((i) => i.ipcNo === ipcNo);
    if (!ipc) throw new Error(`IPC ${ipcNo} not found`);
    const to = applyAction(ipc.status, action);
    if (!to) throw new Error(`Illegal transition: ${ipc.status} via ${action}`);
    ipc.status = to;
    writeJson(ipcKey(projectId), all);
    audit(projectId, action, 'IPC', ipc.ipcNo, `→ ${to}`);
    return ipc;
  }
  async setIpcNote(projectId: string, ipcNo: string, note: string): Promise<Ipc> {
    const all = readIpcs(projectId);
    const ipc = all.find((i) => i.ipcNo === ipcNo);
    if (!ipc) throw new Error(`IPC ${ipcNo} not found`);
    ipc.note = sanitize(note);
    writeJson(ipcKey(projectId), all);
    return ipc;
  }

  // ---- Subcontractors ----
  async listSubcontractors(projectId: string): Promise<Subcontractor[]> {
    return readJson(subKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_SUBS : []));
  }
  async addSubcontractor(projectId: string, input: { name: string; trade: string }): Promise<Subcontractor> {
    const all = readJson<Subcontractor[]>(subKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_SUBS : []));
    const s: Subcontractor = {
      id: `sub-${projectId}-${all.length + 1}`,
      projectId,
      name: sanitize(input.name),
      trade: sanitize(input.trade),
    };
    all.push(s);
    writeJson(subKey(projectId), all);
    return s;
  }

  // ---- RAR ----
  async listRars(projectId: string): Promise<Rar[]> {
    return readJson(rarKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_RARS : []));
  }
  async createRar(
    projectId: string,
    input: { period: string; subcontractorId: string; gross: number },
  ): Promise<Rar> {
    const all = readJson<Rar[]>(rarKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_RARS : []));
    const seq = all.reduce((m, r) => Math.max(m, r.seq), 0) + 1;
    const rar: Rar = {
      id: `rar-${projectId}-${seq}`,
      projectId,
      rarNo: `RAR-${String(seq).padStart(2, '0')}`,
      seq,
      period: input.period,
      status: 'draft',
      subcontractorId: input.subcontractorId,
      gross: input.gross,
      netPayable: computeNet(input.gross),
    };
    all.push(rar);
    writeJson(rarKey(projectId), all);
    return rar;
  }
  async transitionRar(projectId: string, rarNo: string, action: string): Promise<Rar> {
    const all = readJson<Rar[]>(rarKey(projectId), () => SEED_RARS);
    const rar = all.find((r) => r.rarNo === rarNo);
    if (!rar) throw new Error(`RAR ${rarNo} not found`);
    const to = applyRarAction(rar.status, action);
    if (!to) throw new Error(`Illegal transition: ${rar.status} via ${action}`);
    rar.status = to;
    writeJson(rarKey(projectId), all);
    audit(projectId, action, 'RAR', rar.rarNo, `→ ${to}`);
    return rar;
  }
  async setRarNote(projectId: string, rarNo: string, note: string): Promise<Rar> {
    const all = readJson<Rar[]>(rarKey(projectId), () => SEED_RARS);
    const rar = all.find((r) => r.rarNo === rarNo);
    if (!rar) throw new Error(`RAR ${rarNo} not found`);
    rar.note = sanitize(note);
    writeJson(rarKey(projectId), all);
    return rar;
  }

  // ---- Recovery links ----
  async listRarIpcLinks(projectId: string): Promise<RarIpcLink[]> {
    return readJson(linkKey(projectId), () => []);
  }
  async addRarIpcLink(
    projectId: string,
    input: { rarId: string; ipcId: string; amount: number },
  ): Promise<RarIpcLink> {
    const all = readJson<RarIpcLink[]>(linkKey(projectId), () => []);
    const link: RarIpcLink = { id: `lnk-${Date.now()}`, projectId, ...input };
    all.push(link);
    writeJson(linkKey(projectId), all);
    return link;
  }

  // ---- EPC ----
  async listEpcs(projectId: string): Promise<Epc[]> {
    return readJson(epcKey(projectId), () => []);
  }
  async createEpc(projectId: string, input: { period: string; amount: number }): Promise<Epc> {
    const all = readJson<Epc[]>(epcKey(projectId), () => []);
    const seq = all.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
    const epc: Epc = {
      id: `epc-${projectId}-${seq}`,
      projectId,
      epcNo: `EPC-${String(seq).padStart(2, '0')}`,
      seq,
      period: input.period,
      status: 'draft',
      amount: input.amount,
    };
    all.push(epc);
    writeJson(epcKey(projectId), all);
    return epc;
  }
  async transitionEpc(projectId: string, epcNo: string, action: string): Promise<Epc> {
    const all = readJson<Epc[]>(epcKey(projectId), () => []);
    const epc = all.find((e) => e.epcNo === epcNo);
    if (!epc) throw new Error(`EPC ${epcNo} not found`);
    const to = applyAction(epc.status, action); // EPC shares the IPC pipeline
    if (!to) throw new Error(`Illegal transition: ${epc.status} via ${action}`);
    epc.status = to;
    writeJson(epcKey(projectId), all);
    audit(projectId, action, 'EPC', epc.epcNo, `→ ${to}`);
    return epc;
  }

  // ---- Advances ----
  async listAdvances(projectId: string): Promise<Advance[]> {
    return readJson(advKey(projectId), () => []);
  }
  async addAdvance(projectId: string, input: Omit<Advance, 'id' | 'projectId'>): Promise<Advance> {
    const all = readJson<Advance[]>(advKey(projectId), () => []);
    const adv: Advance = { id: `adv-${Date.now()}`, projectId, ...input, note: input.note ? sanitize(input.note) : undefined };
    all.push(adv);
    writeJson(advKey(projectId), all);
    return adv;
  }

  // ---- Distributions ----
  async listDistributions(projectId: string): Promise<Distribution[]> {
    return readJson(distKey(projectId), () => []);
  }
  async setDistribution(projectId: string, dist: Distribution): Promise<Distribution> {
    const all = readJson<Distribution[]>(distKey(projectId), () => []);
    const idx = all.findIndex((d) => d.boqItemId === dist.boqItemId);
    if (idx >= 0) all[idx] = dist;
    else all.push(dist);
    writeJson(distKey(projectId), all);
    return dist;
  }

  // ---- Execution & baselines ----
  async listSchedule(projectId: string): Promise<ScheduleActivity[]> {
    return readJson(schedKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_SCHEDULE : []));
  }
  async replaceSchedule(projectId: string, rows: Array<Omit<ScheduleActivity, 'id' | 'projectId'>>): Promise<ScheduleActivity[]> {
    const acts: ScheduleActivity[] = rows.map((r, i) => ({
      id: `act-${projectId}-${i + 1}`, projectId,
      activityId: sanitize(r.activityId), name: sanitize(r.name), wbs: sanitize(r.wbs),
      durationDays: r.durationDays, plannedStart: r.plannedStart, plannedFinish: r.plannedFinish, isMilestone: r.isMilestone,
    }));
    writeJson(schedKey(projectId), acts);
    audit(projectId, 'import', 'Schedule', `${acts.length} activities`);
    return acts;
  }
  async importScurve(projectId: string, points: MonthlySeriesPoint[]): Promise<MonthlySeriesPoint[]> {
    writeJson(seriesKey(projectId), points);
    audit(projectId, 'import', 'S-curve', `${points.length} months`);
    return points;
  }
  async listMonthlySeries(projectId: string): Promise<MonthlySeriesPoint[]> {
    return readJson(seriesKey(projectId), () => {
      const p = PROJECTS.find((x) => x.id === projectId);
      return synthSeries(p?.plannedPct ?? 0, p?.actualPct ?? 0);
    });
  }
  async setMonthlyActual(projectId: string, month: string, actual: number): Promise<MonthlySeriesPoint[]> {
    const series = await this.listMonthlySeries(projectId);
    const next = series.map((pt) => (pt.month === month ? { ...pt, actual } : pt));
    writeJson(seriesKey(projectId), next);
    return next;
  }
  async listResources(projectId: string): Promise<Resource[]> {
    return readJson(resKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_RESOURCES : []));
  }
  async addResource(projectId: string, input: Omit<Resource, 'id' | 'projectId'>): Promise<Resource> {
    const all = readJson<Resource[]>(resKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_RESOURCES : []));
    const r: Resource = { id: `res-${projectId}-${all.length + 1}`, projectId, ...input, name: sanitize(input.name) };
    all.push(r);
    writeJson(resKey(projectId), all);
    return r;
  }

  // ---- Mapping ----
  async listBoqWbs(projectId: string): Promise<BoqWbsLink[]> {
    return readJson(wbsKey(projectId), () => []);
  }
  async setBoqWbs(projectId: string, link: BoqWbsLink): Promise<BoqWbsLink> {
    const all = readJson<BoqWbsLink[]>(wbsKey(projectId), () => []);
    const idx = all.findIndex((l) => l.boqItemId === link.boqItemId);
    if (idx >= 0) all[idx] = link;
    else all.push(link);
    writeJson(wbsKey(projectId), all);
    return link;
  }
  async listBoqMaterial(projectId: string): Promise<BoqMaterialLink[]> {
    return readJson(matKey(projectId), () => []);
  }
  async setBoqMaterial(projectId: string, link: BoqMaterialLink): Promise<BoqMaterialLink> {
    const all = readJson<BoqMaterialLink[]>(matKey(projectId), () => []);
    const idx = all.findIndex((l) => l.boqItemId === link.boqItemId);
    if (idx >= 0) all[idx] = link;
    else all.push(link);
    writeJson(matKey(projectId), all);
    return link;
  }

  // ---- Financial ----
  async listReceipts(projectId: string): Promise<FinancialReceipt[]> {
    return readJson(rcptKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_RECEIPTS : []));
  }
  async addReceipt(projectId: string, input: Omit<FinancialReceipt, 'id' | 'projectId'>): Promise<FinancialReceipt> {
    const all = readJson<FinancialReceipt[]>(rcptKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_RECEIPTS : []));
    const r: FinancialReceipt = { id: `rcpt-${projectId}-${all.length + 1}`, projectId, ...input, source: sanitize(input.source) };
    all.push(r);
    writeJson(rcptKey(projectId), all);
    return r;
  }
  async listPayments(projectId: string): Promise<FinancialPayment[]> {
    return readJson(payKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_PAYMENTS : []));
  }
  async addPayment(projectId: string, input: Omit<FinancialPayment, 'id' | 'projectId'>): Promise<FinancialPayment> {
    const all = readJson<FinancialPayment[]>(payKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_PAYMENTS : []));
    const p: FinancialPayment = { id: `pay-${projectId}-${all.length + 1}`, projectId, ...input };
    all.push(p);
    writeJson(payKey(projectId), all);
    return p;
  }
  async listLiabilities(projectId: string): Promise<FinancialLiability[]> {
    return readJson(liabKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_LIABILITIES : []));
  }
  async addLiability(projectId: string, input: Omit<FinancialLiability, 'id' | 'projectId'>): Promise<FinancialLiability> {
    const all = readJson<FinancialLiability[]>(liabKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_LIABILITIES : []));
    const l: FinancialLiability = { id: `liab-${projectId}-${all.length + 1}`, projectId, ...input, kind: sanitize(input.kind) };
    all.push(l);
    writeJson(liabKey(projectId), all);
    return l;
  }

  // ---- Procurement ----
  async listSuppliers(projectId: string): Promise<Supplier[]> {
    return readJson(supplierKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_SUPPLIERS : []));
  }
  async addSupplier(projectId: string, input: Omit<Supplier, 'id' | 'projectId'>): Promise<Supplier> {
    const all = readJson<Supplier[]>(supplierKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_SUPPLIERS : []));
    const s: Supplier = { id: `sup-${projectId}-${all.length + 1}`, projectId, ...input, name: sanitize(input.name) };
    all.push(s);
    writeJson(supplierKey(projectId), all);
    return s;
  }

  async listDemands(projectId: string): Promise<Demand[]> {
    return readJson(demandKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_DEMANDS : []));
  }
  async createDemand(
    projectId: string,
    input: { type: DemandType; justification: string; items: DemandItem[] },
  ): Promise<Demand> {
    const all = readJson<Demand[]>(demandKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_DEMANDS : []));
    const seq = all.reduce((m, d) => Math.max(m, d.seq), 0) + 1;
    const totalEstimated = input.items.reduce((a, i) => a + i.qty * i.estimatedRate, 0);
    const demand: Demand = {
      id: `dmd-${projectId}-${seq}`,
      projectId,
      demandNo: `DMD-${String(seq).padStart(2, '0')}`,
      seq,
      type: input.type,
      justification: sanitize(input.justification),
      totalEstimated,
      chainType: DEMAND_CHAIN[input.type],
      currentStage: 0,
      items: input.items,
      history: [{ stageIndex: 0, action: 'raise', role: 'pic', at: new Date().toISOString() }],
    };
    all.push(demand);
    writeJson(demandKey(projectId), all);
    audit(projectId, 'raise', 'Demand', demand.demandNo, demand.type);
    return demand;
  }
  async advanceDemand(projectId: string, demandNo: string, role: string): Promise<Demand> {
    const all = readJson<Demand[]>(demandKey(projectId), () => SEED_DEMANDS);
    const d = all.find((x) => x.demandNo === demandNo);
    if (!d) throw new Error(`Demand ${demandNo} not found`);
    const chk = checkAdvance(d.chainType, d.currentStage, role, d.totalEstimated);
    if (!chk.ok || !chk.stage) throw new Error(chk.error ?? 'Cannot advance');
    d.currentStage = chk.stage.index;
    d.history.push({ stageIndex: chk.stage.index, action: chk.stage.action, role, at: new Date().toISOString() });
    writeJson(demandKey(projectId), all);
    audit(projectId, chk.stage.action, 'Demand', d.demandNo, `by ${role}`);
    return d;
  }

  async listPurchaseOrders(projectId: string): Promise<PurchaseOrder[]> {
    return readJson(poKey(projectId), () => []);
  }
  async createPurchaseOrder(projectId: string, input: { demandId: string; supplierId: string }): Promise<PurchaseOrder> {
    const demands = await this.listDemands(projectId);
    const demand = demands.find((d) => d.id === input.demandId);
    const all = readJson<PurchaseOrder[]>(poKey(projectId), () => []);
    const seq = all.reduce((m, p) => Math.max(m, p.seq), 0) + 1;
    const po: PurchaseOrder = {
      id: `po-${projectId}-${seq}`,
      projectId,
      poNo: `PO-${String(seq).padStart(2, '0')}`,
      seq,
      demandId: input.demandId,
      supplierId: input.supplierId,
      totalValue: demand?.totalEstimated ?? 0,
      status: 'open',
    };
    all.push(po);
    writeJson(poKey(projectId), all);
    return po;
  }

  async listCrvs(projectId: string): Promise<Crv[]> {
    return readJson(crvKey(projectId), () => []);
  }
  async createCrv(projectId: string, input: { poId: string; received: CrvLine[] }): Promise<Crv> {
    const pos = await this.listPurchaseOrders(projectId);
    const demands = await this.listDemands(projectId);
    const po = pos.find((p) => p.id === input.poId);
    const demand = demands.find((d) => d.id === po?.demandId);
    const ordered = new Map((demand?.items ?? []).map((i) => [i.code, i.qty]));
    const all = readJson<Crv[]>(crvKey(projectId), () => []);
    // Cumulative received per code across existing CRVs for this PO + this one.
    const prior = new Map<string, number>();
    for (const c of all.filter((c) => c.poId === input.poId)) {
      for (const r of c.received) prior.set(r.code, (prior.get(r.code) ?? 0) + r.qtyReceived);
    }
    let overReceipt = false;
    for (const r of input.received) {
      const cum = (prior.get(r.code) ?? 0) + r.qtyReceived;
      const ord = ordered.get(r.code);
      if (ord != null && cum > ord) overReceipt = true;
    }
    const seq = all.reduce((m, c) => Math.max(m, c.seq), 0) + 1;
    const crv: Crv = {
      id: `crv-${projectId}-${seq}`,
      projectId,
      crvNo: `CRV-${String(seq).padStart(2, '0')}`,
      seq,
      poId: input.poId,
      received: input.received,
      overReceipt,
    };
    all.push(crv);
    writeJson(crvKey(projectId), all);
    return crv;
  }

  async listProcPayments(projectId: string): Promise<ProcPayment[]> {
    return readJson(ppayKey(projectId), () => []);
  }
  async createProcPayment(
    projectId: string,
    input: { refType: 'po' | 'hire'; refId: string; amount: number; chainType: ProcChainType },
  ): Promise<ProcPayment> {
    const all = readJson<ProcPayment[]>(ppayKey(projectId), () => []);
    const seq = all.reduce((m, p) => Math.max(m, p.seq), 0) + 1;
    const pay: ProcPayment = {
      id: `ppay-${projectId}-${seq}`,
      projectId,
      paymentNo: `PAY-${String(seq).padStart(2, '0')}`,
      seq,
      refType: input.refType,
      refId: input.refId,
      amount: input.amount,
      chainType: input.chainType,
      currentStage: 0,
      history: [{ stageIndex: 0, action: 'raise', role: 'pic', at: new Date().toISOString() }],
    };
    all.push(pay);
    writeJson(ppayKey(projectId), all);
    return pay;
  }
  async advanceProcPayment(projectId: string, paymentNo: string, role: string): Promise<ProcPayment> {
    const all = readJson<ProcPayment[]>(ppayKey(projectId), () => []);
    const p = all.find((x) => x.paymentNo === paymentNo);
    if (!p) throw new Error(`Payment ${paymentNo} not found`);
    const chk = checkAdvance(p.chainType, p.currentStage, role, p.amount);
    if (!chk.ok || !chk.stage) throw new Error(chk.error ?? 'Cannot advance');
    p.currentStage = chk.stage.index;
    p.history.push({ stageIndex: chk.stage.index, action: chk.stage.action, role, at: new Date().toISOString() });
    writeJson(ppayKey(projectId), all);
    audit(projectId, chk.stage.action, 'Payment', p.paymentNo, `by ${role}`);
    return p;
  }

  async listHires(projectId: string): Promise<MachineryHire[]> {
    return readJson(hireKey(projectId), () => []);
  }
  async createHire(
    projectId: string,
    input: { supplierId: string; rateBasis: MachineryHire['rateBasis']; rate: number },
  ): Promise<MachineryHire> {
    const all = readJson<MachineryHire[]>(hireKey(projectId), () => []);
    const seq = all.reduce((m, h) => Math.max(m, h.seq), 0) + 1;
    const hire: MachineryHire = {
      id: `hire-${projectId}-${seq}`,
      projectId,
      hireNo: `HIRE-${String(seq).padStart(2, '0')}`,
      seq,
      supplierId: input.supplierId,
      rateBasis: input.rateBasis,
      rate: input.rate,
      utilization: [],
    };
    all.push(hire);
    writeJson(hireKey(projectId), all);
    return hire;
  }
  async addHireUtilization(projectId: string, hireNo: string, entry: { dated: string; units: number }): Promise<MachineryHire> {
    const all = readJson<MachineryHire[]>(hireKey(projectId), () => []);
    const hire = all.find((h) => h.hireNo === hireNo);
    if (!hire) throw new Error(`Hire ${hireNo} not found`);
    hire.utilization.push({ dated: entry.dated, units: entry.units });
    hire.utilization.sort((a, b) => a.dated.localeCompare(b.dated));
    writeJson(hireKey(projectId), all);
    return hire;
  }

  async listAudit(): Promise<AuditEntry[]> {
    return readAudit();
  }

  async getPeriodMap(projectId: string): Promise<Record<string, string>> {
    return readJson(periodMapKey(projectId), () => ({}));
  }
  async setPeriodMapping(projectId: string, ipcNo: string, month: string): Promise<Record<string, string>> {
    const map = readJson<Record<string, string>>(periodMapKey(projectId), () => ({}));
    if (month) map[ipcNo] = month; else delete map[ipcNo];
    writeJson(periodMapKey(projectId), map);
    return map;
  }

  async listSalients(projectId: string): Promise<Salient[]> {
    return readJson(salientKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_SALIENTS : []));
  }
  async upsertSalient(projectId: string, input: { id?: string; label: string; value: string }): Promise<Salient> {
    const all = readJson<Salient[]>(salientKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_SALIENTS : []));
    const label = sanitize(input.label), value = sanitize(input.value);
    let s: Salient;
    if (input.id) {
      s = all.find((x) => x.id === input.id)!;
      if (s) { s.label = label; s.value = value; }
      else { s = { id: input.id, projectId, label, value }; all.push(s); }
    } else {
      s = { id: `sal-${projectId}-${Date.now()}`, projectId, label, value };
      all.push(s);
    }
    writeJson(salientKey(projectId), all);
    return s;
  }
  async deleteSalient(projectId: string, id: string): Promise<void> {
    const all = readJson<Salient[]>(salientKey(projectId), () => []);
    writeJson(salientKey(projectId), all.filter((s) => s.id !== id));
  }

  async reverseIpc(projectId: string, ipcNo: string): Promise<Ipc> {
    const all = readJson<Ipc[]>(ipcKey(projectId), () => []);
    const ipc = all.find((i) => i.ipcNo === ipcNo);
    if (!ipc) throw new Error(`IPC ${ipcNo} not found`);
    const idx = IPC_PIPELINE.indexOf(ipc.status);
    if (idx <= 0) throw new Error('IPC is at the first stage; nothing to reverse.');
    const from = ipc.status;
    ipc.status = IPC_PIPELINE[idx - 1];
    writeJson(ipcKey(projectId), all);
    audit(projectId, 'reverse', 'IPC', ipc.ipcNo, `${from} → ${ipc.status}`);
    return ipc;
  }

  async listProductionRuns(projectId: string): Promise<ProductionRun[]> {
    return readJson(prodKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_PRODUCTION : []));
  }
  async createProductionRun(projectId: string, input: Omit<ProductionRun, 'id' | 'projectId'>): Promise<ProductionRun> {
    const all = readJson<ProductionRun[]>(prodKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_PRODUCTION : []));
    const run: ProductionRun = { id: `prod-${projectId}-${all.length + 1}`, projectId, ...input, product: sanitize(input.product) };
    all.push(run);
    all.sort((a, b) => a.dated.localeCompare(b.dated));
    writeJson(prodKey(projectId), all);
    return run;
  }
  async listMaterialIssues(projectId: string): Promise<MaterialIssue[]> {
    return readJson(issueKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_ISSUES : []));
  }
  async createMaterialIssue(projectId: string, input: Omit<MaterialIssue, 'id' | 'projectId'>): Promise<MaterialIssue> {
    const all = readJson<MaterialIssue[]>(issueKey(projectId), () => (projectId === 'proj-f14f15' ? SEED_ISSUES : []));
    const iss: MaterialIssue = { id: `mi-${projectId}-${all.length + 1}`, projectId, ...input, materialCode: sanitize(input.materialCode), issuedTo: sanitize(input.issuedTo) };
    all.push(iss);
    all.sort((a, b) => a.dated.localeCompare(b.dated));
    writeJson(issueKey(projectId), all);
    return iss;
  }
}

// ---- localStorage helpers + seeds ----
const commentKey = (nodeId: string) => `nlc-ecc.comments.${nodeId}`;
const boqKey = (pid: string) => `nlc-ecc.boq.${pid}`;
const ipcKey = (pid: string) => `nlc-ecc.ipcs.${pid}`;
const subKey = (pid: string) => `nlc-ecc.subs.${pid}`;
const rarKey = (pid: string) => `nlc-ecc.rars.${pid}`;
const linkKey = (pid: string) => `nlc-ecc.rarlinks.${pid}`;
const epcKey = (pid: string) => `nlc-ecc.epcs.${pid}`;
const advKey = (pid: string) => `nlc-ecc.advances.${pid}`;
const distKey = (pid: string) => `nlc-ecc.dists.${pid}`;
const schedKey = (pid: string) => `nlc-ecc.sched.${pid}`;
const seriesKey = (pid: string) => `nlc-ecc.series.${pid}`;
const nodesKey = 'nlc-ecc.nodes';
const projectsKey = 'nlc-ecc.projects';
const resKey = (pid: string) => `nlc-ecc.resources.${pid}`;
const wbsKey = (pid: string) => `nlc-ecc.boqwbs.${pid}`;
const matKey = (pid: string) => `nlc-ecc.boqmat.${pid}`;
const rcptKey = (pid: string) => `nlc-ecc.receipts.${pid}`;
const payKey = (pid: string) => `nlc-ecc.payments.${pid}`;
const liabKey = (pid: string) => `nlc-ecc.liabilities.${pid}`;
const supplierKey = (pid: string) => `nlc-ecc.suppliers.${pid}`;
const demandKey = (pid: string) => `nlc-ecc.demands.${pid}`;
const poKey = (pid: string) => `nlc-ecc.pos.${pid}`;
const crvKey = (pid: string) => `nlc-ecc.crvs.${pid}`;
const ppayKey = (pid: string) => `nlc-ecc.ppays.${pid}`;
const hireKey = (pid: string) => `nlc-ecc.hires.${pid}`;
const prodKey = (pid: string) => `nlc-ecc.production.${pid}`;
const issueKey = (pid: string) => `nlc-ecc.materialIssues.${pid}`;
const salientKey = (pid: string) => `nlc-ecc.salients.${pid}`;
const photoKey = (pid: string) => `nlc-ecc.photos.${pid}`;
const periodMapKey = (pid: string) => `nlc-ecc.periodMap.${pid}`;

const SEED_PHOTOS: ProjectPhoto[] = [
  { id: 'ph-proj-f14f15-1', projectId: 'proj-f14f15', url: 'https://picsum.photos/seed/nlc-earthworks/640/420', caption: 'Earthworks & subgrade — Sector F-15', dated: '2026-03-18' },
  { id: 'ph-proj-f14f15-2', projectId: 'proj-f14f15', url: 'https://picsum.photos/seed/nlc-culvert/640/420', caption: 'Box culvert RD 12+000', dated: '2026-04-22' },
  { id: 'ph-proj-f14f15-3', projectId: 'proj-f14f15', url: 'https://picsum.photos/seed/nlc-paving/640/420', caption: 'Asphalt wearing course laydown', dated: '2026-05-26' },
];

const SEED_SALIENTS: Salient[] = [
  { id: 'sal-proj-f14f15-1', projectId: 'proj-f14f15', label: 'Client', value: 'FGEHA' },
  { id: 'sal-proj-f14f15-2', projectId: 'proj-f14f15', label: 'Consultant', value: 'NESPAK' },
  { id: 'sal-proj-f14f15-3', projectId: 'proj-f14f15', label: 'Scope', value: 'Sectors F-14 & F-15 development works' },
  { id: 'sal-proj-f14f15-4', projectId: 'proj-f14f15', label: 'Completion', value: 'Aug 2026 (contractual)' },
  { id: 'sal-proj-f14f15-5', projectId: 'proj-f14f15', label: 'Mobilization', value: 'Sep 2025' },
];

const SEED_PRODUCTION: ProductionRun[] = [
  { id: 'prod-proj-f14f15-1', projectId: 'proj-f14f15', dated: '2026-05-12', product: 'Asphalt wearing course', unit: 'tonne', plannedQty: 600, actualQty: 540 },
  { id: 'prod-proj-f14f15-2', projectId: 'proj-f14f15', dated: '2026-05-26', product: 'Asphalt wearing course', unit: 'tonne', plannedQty: 600, actualQty: 615 },
  { id: 'prod-proj-f14f15-3', projectId: 'proj-f14f15', dated: '2026-06-02', product: 'Concrete (batching)', unit: 'm³', plannedQty: 320, actualQty: 298 },
];

const SEED_ISSUES: MaterialIssue[] = [
  { id: 'mi-proj-f14f15-1', projectId: 'proj-f14f15', dated: '2026-05-14', materialCode: 'M-CEM', qty: 8000, issuedTo: 'Structures (culverts)' },
  { id: 'mi-proj-f14f15-2', projectId: 'proj-f14f15', dated: '2026-05-30', materialCode: 'M-CEM', qty: 6500, issuedTo: 'Box culvert RD 12+000' },
];

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

// ---- Audit (append-only) ----
const AUDIT_KEY = 'nlc-ecc.audit';
function readAudit(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_KEY);
    return raw ? (JSON.parse(raw) as AuditEntry[]) : [];
  } catch {
    return [];
  }
}
function audit(projectId: string, action: string, entity: string, ref: string, detail?: string): void {
  const all = readAudit();
  all.unshift({
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    projectId, action, entity, ref, detail,
  });
  writeJson(AUDIT_KEY, all.slice(0, 500)); // cap
}

/** Read JSON from localStorage, seeding (and persisting) a default if absent. */
function readJson<T>(key: string, seed: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* ignore */
  }
  const seeded = seed();
  writeJson(key, seeded);
  return JSON.parse(JSON.stringify(seeded)) as T;
}

const SEED_SUBS: Subcontractor[] = [
  { id: 'sub-proj-f14f15-1', projectId: 'proj-f14f15', name: 'Frontier Works Org (FWO)', trade: 'Earthworks' },
  { id: 'sub-proj-f14f15-2', projectId: 'proj-f14f15', name: 'Sardar & Sons', trade: 'Bituminous works' },
  { id: 'sub-proj-f14f15-3', projectId: 'proj-f14f15', name: 'Reliable Construction', trade: 'RCC structures' },
];

const SEED_RARS: Rar[] = [
  { id: 'rar-proj-f14f15-1', projectId: 'proj-f14f15', rarNo: 'RAR-01', seq: 1, period: 'Feb-2026', status: 'paid', subcontractorId: 'sub-proj-f14f15-1', gross: 1800000000, netPayable: computeNet(1800000000) },
  { id: 'rar-proj-f14f15-2', projectId: 'proj-f14f15', rarNo: 'RAR-02', seq: 2, period: 'Apr-2026', status: 'approved', subcontractorId: 'sub-proj-f14f15-2', gross: 2100000000, netPayable: computeNet(2100000000) },
  { id: 'rar-proj-f14f15-3', projectId: 'proj-f14f15', rarNo: 'RAR-03', seq: 3, period: 'May-2026', status: 'submitted', subcontractorId: 'sub-proj-f14f15-3', gross: 1450000000, netPayable: computeNet(1450000000) },
];

const SEED_SCHEDULE: ScheduleActivity[] = [
  { id: 'a1', projectId: 'proj-f14f15', activityId: 'A-1000', name: 'Mobilization', wbs: '1.1', durationDays: 30, plannedStart: '2025-09-01', plannedFinish: '2025-09-30', isMilestone: false },
  { id: 'a2', projectId: 'proj-f14f15', activityId: 'A-2000', name: 'Earthworks & subgrade', wbs: '2.1', durationDays: 150, plannedStart: '2025-10-01', plannedFinish: '2026-02-28', isMilestone: false },
  { id: 'a3', projectId: 'proj-f14f15', activityId: 'A-3000', name: 'Sub-base & base course', wbs: '2.2', durationDays: 120, plannedStart: '2026-01-15', plannedFinish: '2026-05-15', isMilestone: false },
  { id: 'a4', projectId: 'proj-f14f15', activityId: 'A-4000', name: 'Structures (culverts)', wbs: '3.1', durationDays: 180, plannedStart: '2026-02-01', plannedFinish: '2026-07-31', isMilestone: false },
  { id: 'a5', projectId: 'proj-f14f15', activityId: 'M-1', name: 'Substantial completion', wbs: '4.0', durationDays: 0, plannedStart: '2026-08-31', plannedFinish: '2026-08-31', isMilestone: true },
];

const SEED_RESOURCES: Resource[] = [
  { id: 'r1', projectId: 'proj-f14f15', resourceClass: 'plant', name: 'Asphalt batching plant', unit: 'no', qty: 1 },
  { id: 'r2', projectId: 'proj-f14f15', resourceClass: 'equipment', name: 'Motor graders', unit: 'no', qty: 3 },
  { id: 'r3', projectId: 'proj-f14f15', resourceClass: 'store', name: 'Bitumen 60/70', unit: 'MT', qty: 4200 },
];

const SEED_RECEIPTS: FinancialReceipt[] = [
  { id: 're1', projectId: 'proj-f14f15', month: 'Nov-25', source: 'Mob advance', amount: 1900000000 },
  { id: 're2', projectId: 'proj-f14f15', month: 'Feb-26', source: 'IPC-01', amount: 3486000000 },
  { id: 're3', projectId: 'proj-f14f15', month: 'Apr-26', source: 'IPC-02 part', amount: 2600000000 },
  { id: 're4', projectId: 'proj-f14f15', month: 'Jun-26', source: 'IPC-02 part', amount: 1814000000 },
];
const SEED_PAYMENTS: FinancialPayment[] = [
  { id: 'pa1', projectId: 'proj-f14f15', month: 'Nov-25', category: 'materials', amount: 900000000 },
  { id: 'pa2', projectId: 'proj-f14f15', month: 'Dec-25', category: 'subcontract', amount: 1200000000 },
  { id: 'pa3', projectId: 'proj-f14f15', month: 'Feb-26', category: 'materials', amount: 1500000000 },
  { id: 'pa4', projectId: 'proj-f14f15', month: 'Mar-26', category: 'labour', amount: 700000000 },
  { id: 'pa5', projectId: 'proj-f14f15', month: 'Apr-26', category: 'plant', amount: 600000000 },
  { id: 'pa6', projectId: 'proj-f14f15', month: 'May-26', category: 'subcontract', amount: 1300000000 },
  { id: 'pa7', projectId: 'proj-f14f15', month: 'Jun-26', category: 'overhead', amount: 450000000 },
];
const SEED_LIABILITIES: FinancialLiability[] = [
  { id: 'li1', projectId: 'proj-f14f15', kind: 'Retention held', amount: 1120000000 },
  { id: 'li2', projectId: 'proj-f14f15', kind: 'Outstanding RAR (approved)', amount: 1743000000 },
];

const SEED_SUPPLIERS: Supplier[] = [
  { id: 'sup-proj-f14f15-1', projectId: 'proj-f14f15', name: 'Attock Cement Ltd', kind: 'material' },
  { id: 'sup-proj-f14f15-2', projectId: 'proj-f14f15', name: 'Descon Equipment', kind: 'machinery' },
  { id: 'sup-proj-f14f15-3', projectId: 'proj-f14f15', name: 'Pak Steel Mills', kind: 'material' },
];

const SEED_DEMANDS: Demand[] = [
  {
    id: 'dmd-proj-f14f15-1', projectId: 'proj-f14f15', demandNo: 'DMD-01', seq: 1,
    type: 'material', justification: 'Cement for box culverts (Bill 3)',
    totalEstimated: 18000000, chainType: 'proc_demand_material', currentStage: 1,
    items: [
      { code: 'M-CEM', description: 'OPC cement 53-grade', unit: 'bag', qty: 24000, estimatedRate: 750, boqItemId: 'boq-proj-f14f15-4' },
    ],
    history: [
      { stageIndex: 0, action: 'raise', role: 'pic', at: '2026-05-02T09:00:00Z' },
      { stageIndex: 1, action: 'validate', role: 'pm', at: '2026-05-03T09:00:00Z' },
    ],
  },
];

function readBoq(projectId: string): BoqItem[] {
  try {
    const raw = localStorage.getItem(boqKey(projectId));
    if (raw) return JSON.parse(raw) as BoqItem[];
  } catch {
    /* ignore */
  }
  // Seed a small BOQ for the flagship project so the register isn't empty.
  if (projectId === 'proj-f14f15') {
    const seeded = SEED_BOQ.map((r, i) => ({
      id: `boq-${projectId}-${i}`,
      projectId,
      ...r,
      amount: itemAmount(r.qty, r.rate),
    }));
    writeJson(boqKey(projectId), seeded);
    return seeded;
  }
  return [];
}

function readIpcs(projectId: string): Ipc[] {
  try {
    const raw = localStorage.getItem(ipcKey(projectId));
    if (raw) return JSON.parse(raw) as Ipc[];
  } catch {
    /* ignore */
  }
  if (projectId === 'proj-f14f15') {
    writeJson(ipcKey(projectId), SEED_IPCS);
    return JSON.parse(JSON.stringify(SEED_IPCS)) as Ipc[];
  }
  return [];
}

const SEED_BOQ: Array<Omit<BoqItem, 'id' | 'projectId' | 'amount'>> = [
  { billNo: '1', code: 'I-101', description: 'Site clearance & grubbing', unit: 'Sqm', qty: 45000, rate: 85 },
  { billNo: '1', code: 'I-102', description: 'Common excavation', unit: 'Cum', qty: 120000, rate: 420 },
  { billNo: '2', code: 'I-201', description: 'Sub-base course (aggregate)', unit: 'Cum', qty: 38000, rate: 5400 },
  { billNo: '2', code: 'I-202', description: 'Dense bituminous macadam', unit: 'Cum', qty: 21000, rate: 23500 },
  { billNo: '3', code: 'I-301', description: 'RCC for box culverts', unit: 'Cum', qty: 6400, rate: 41000 },
];

const SEED_IPCS: Ipc[] = [
  { id: 'ipc-proj-f14f15-1', projectId: 'proj-f14f15', ipcNo: 'IPC-01', seq: 1, period: 'Jan-2026', status: 'paid', gross: 4200000000, netPayable: computeNet(4200000000), cumGross: 4200000000 },
  { id: 'ipc-proj-f14f15-2', projectId: 'proj-f14f15', ipcNo: 'IPC-02', seq: 2, period: 'Mar-2026', status: 'approved', gross: 3800000000, netPayable: computeNet(3800000000), cumGross: 8000000000 },
  { id: 'ipc-proj-f14f15-3', projectId: 'proj-f14f15', ipcNo: 'IPC-03', seq: 3, period: 'May-2026', status: 'vetted', gross: 3200000000, netPayable: computeNet(3200000000), cumGross: 11200000000 },
];

function readComments(nodeId: string): NodeComment[] {
  try {
    const raw = localStorage.getItem(commentKey(nodeId));
    return raw ? (JSON.parse(raw) as NodeComment[]) : [];
  } catch {
    return [];
  }
}

// Write-time sanitization mirrors the prototype's _sanitizeText; the render
// layer also escapes. Strips angle brackets to defang injected markup.
function sanitize(text: string): string {
  return text.replace(/[<>]/g, '').trim().slice(0, 2000);
}
