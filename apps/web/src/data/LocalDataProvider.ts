import {
  DataProvider, OrgNode, Project, NodeComment, BoqItem, Ipc,
  Subcontractor, Rar, RarLine, RarRecovery, RarIpcLink, Epc, Advance, BankGuarantee, Distribution, Variation, VariationLine, Contract, CommercialConfig,
  ScheduleActivity, MonthlySeriesPoint, Resource, BoqWbsLink, BoqMaterialLink,
  FinancialReceipt, FinancialPayment, FinancialLiability,
  Supplier, Demand, DemandItem, DemandType, PurchaseOrder, Crv, CrvLine,
  ProcPayment, ProcChainType, MachineryHire, AuditEntry, AlertState, AppUser, Directive, DirectiveStatus, ProjectStage, MaterialMaster, DlpDefect, MarkInput, HrProposal, HrProposalEntry, SupplierBill, SupplierBillLine,
  ProductionRun, MaterialIssue, MachineryUsage, Salient, ProjectPhoto, Attachment, Allocation, ContractApproval, OverheadLine,
  InventoryItem, PolRecord, FixedAsset, MaintenanceRequest, HrPosting, HrUnit, HrPerson, HrRequisition, HrCredential, HrTransfer, HrEstablishmentVersion, ProgressUpdate,
} from './types';
import { itemAmount } from '../domain/boq';
import { APPOINTMENTS, legacyRoleFor } from '../domain/appointments';
import { DEFAULT_MIX_DESIGNS, type MixDesign } from '../domain/mixdesigns';
import { newChain, act, returnForCorrection, resubmit, contractApprovalChain, rarApprovalChain, hrApprovalChain, supplierBillChain, isCentralMaterial } from '../domain/apptchain';
import { applyAction, computeNet, IPC_PIPELINE, DEFAULT_COMMERCIAL_CONFIG, DEFAULT_CONTRACT_RETENTION_PCT } from '../domain/ipc';
import { DEFAULT_PBS_COMPONENTS, type EscalationComponent } from '../domain/escalation';
import { applyVoAction, applyVariationToBoq, variationLinesAmount, dominantVariationType } from '../domain/variations';
import { seedFor, type SeedProfile, type GeneratedSeed } from './seed/commercialSeed';
import { INITIAL_BOQ_WORKFLOW, pendingBoqStage, advanceBoq, raiseVo, type BoqWorkflowState } from '../domain/boqworkflow';
import { pendingRarStage, advanceRar, isRarPaid } from '../domain/rarchain';
import { INITIAL_BASELINE_WORKFLOW, pendingBaselineStage, advanceBaseline, amendBaseline } from '../domain/schedulebaseline';
import { INITIAL_MAPPING_WORKFLOW, pendingMappingStage, advanceMappingWf, amendMappingWf } from '../domain/mappingapproval';
import { pendingMaintStage, advanceMaint, isMaintComplete } from '../domain/maintenance';
import type { BaselineWorkflowState } from '../domain/schedulebaseline';
import { ROLE_LABEL } from '../domain/chains';
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
  { id: 'proj-dha-ph8', name: 'DHA Phase-8 Road Network', pdHqId: 'pd-north', client: 'DHA Islamabad', cv: '15800000000', billed: '6200000000', received: '5100000000', planned: 46, actual: 42 },
  { id: 'proj-i11-infra', name: 'I-11 Sector Infrastructure', pdHqId: 'pd-north', client: 'CDA', cv: '9450000000', billed: '9450000000', received: '9450000000', planned: 100, actual: 100 },
  { id: 'proj-margalla-rd', name: 'Margalla Avenue Extension', pdHqId: 'pd-north', client: 'CDA', cv: '21300000000', billed: '8900000000', received: '7400000000', planned: 50, actual: 47 },
  { id: 'proj-c12-infra', name: 'C-12/C-13 Development', pdHqId: 'pd-centre', client: 'FGEHA', cv: '13700000000', billed: '5100000000', received: '4200000000', planned: 41, actual: 36 },
  { id: 'proj-attock-byp', name: 'Attock Bypass', pdHqId: 'pd-centre', client: 'NHA', cv: '11200000000', billed: '10800000000', received: '9200000000', planned: 100, actual: 100 },
  { id: 'proj-chakwal-rd', name: 'Chakwal–Talagang Road', pdHqId: 'pd-centre', client: 'C&W Punjab', cv: '8900000000', billed: '2400000000', received: '1700000000', planned: 31, actual: 24 },
  { id: 'proj-d-i-khan', name: 'D.I. Khan Northern Bypass', pdHqId: 'pd-kpk', client: 'NHA', cv: '17600000000', billed: '9100000000', received: '7800000000', planned: 53, actual: 49 },
  { id: 'proj-hazara-exp', name: 'Hazara Expressway Link', pdHqId: 'pd-kpk', client: 'KPHA', cv: '38500000000', billed: '13200000000', received: '10800000000', planned: 38, actual: 30 },
  { id: 'proj-thar-coal-rd', name: 'Thar Coalfield Access Roads', pdHqId: 'pd-sindh', client: 'SECMC', cv: '14300000000', billed: '13900000000', received: '13100000000', planned: 100, actual: 100 },
  { id: 'proj-khi-northern', name: 'Karachi Northern Bypass', pdHqId: 'pd-sindh', client: 'NHA', cv: '26800000000', billed: '11400000000', received: '9600000000', planned: 45, actual: 40 },
  { id: 'proj-rcd-hwy', name: 'RCD Highway Reconstruction', pdHqId: 'pd-bln', client: 'NHA', cv: '33100000000', billed: '12000000000', received: '9500000000', planned: 36, actual: 28 },
  { id: 'proj-quetta-wss', name: 'Quetta Water Supply Scheme', pdHqId: 'pd-bln', client: 'PHED Bln', cv: '9700000000', billed: '3300000000', received: '2500000000', planned: 34, actual: 27 },
];

const NODES: OrgNode[] = [
  { id: 'hq-nlc', name: 'HQ NLC', type: 'hq', parentId: null, lat: 33.5969, lng: 73.0862, location: 'GHQ NLC, Rawalpindi' },
  { id: 'hq-engrs', name: 'HQ Engineers', type: 'hq_engrs', parentId: 'hq-nlc', lat: 33.6007, lng: 73.0679, location: 'HQ Engineers, Rawalpindi' },
  { id: 'pd-north', name: 'HQ PD North', type: 'pd_hq', parentId: 'hq-engrs', lat: 33.6938, lng: 73.0651, location: 'Islamabad' },
  { id: 'pd-centre', name: 'HQ PD Centre', type: 'pd_hq', parentId: 'hq-engrs', lat: 33.6573, lng: 73.0479, location: 'Islamabad / Rawalpindi' },
  { id: 'pd-kpk', name: 'HQ PD KPK', type: 'pd_hq', parentId: 'hq-engrs', lat: 34.0151, lng: 71.5249, location: 'Peshawar' },
  { id: 'pd-sindh', name: 'HQ PD Sindh', type: 'pd_hq', parentId: 'hq-engrs', lat: 24.8607, lng: 67.0011, location: 'Karachi' },
  { id: 'pd-bln', name: 'HQ PD Bln', type: 'pd_hq', parentId: 'hq-engrs', lat: 30.1798, lng: 66.9750, location: 'Quetta' },
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
  'proj-dha-ph8': { lat: 33.52, lng: 73.15, location: 'DHA Phase 8, Islamabad' },
  'proj-i11-infra': { lat: 33.66, lng: 73.02, location: 'I-11, Islamabad' },
  'proj-margalla-rd': { lat: 33.73, lng: 73.03, location: 'Margalla Avenue, Islamabad' },
  'proj-c12-infra': { lat: 33.64, lng: 72.92, location: 'C-12/C-13, Islamabad' },
  'proj-attock-byp': { lat: 33.77, lng: 72.36, location: 'Attock' },
  'proj-chakwal-rd': { lat: 32.93, lng: 72.85, location: 'Chakwal' },
  'proj-d-i-khan': { lat: 31.83, lng: 70.90, location: 'D.I. Khan' },
  'proj-hazara-exp': { lat: 34.20, lng: 73.24, location: 'Hazara' },
  'proj-thar-coal-rd': { lat: 24.78, lng: 70.25, location: 'Tharparkar' },
  'proj-khi-northern': { lat: 25.05, lng: 67.10, location: 'Karachi' },
  'proj-rcd-hwy': { lat: 27.50, lng: 65.50, location: 'RCD Highway, Balochistan' },
  'proj-quetta-wss': { lat: 30.18, lng: 66.98, location: 'Quetta' },
};
const DATES: Record<string, { start: string; finish: string }> = {
  'proj-f14f15': { start: '2025-01-15', finish: '2026-08-31' },
  'proj-bahria': { start: '2024-09-01', finish: '2026-10-31' },
  'proj-e12': { start: '2025-06-01', finish: '2027-05-31' },
  'proj-rwp-ring': { start: '2024-03-01', finish: '2027-02-28' },
  'proj-m2-rehab': { start: '2024-07-01', finish: '2026-09-30' },
  'proj-swat-expr': { start: '2025-03-01', finish: '2028-02-29' },
  'proj-khi-water': { start: '2024-11-01', finish: '2027-10-31' },
  'proj-gwadar': { start: '2025-09-01', finish: '2027-08-31' },
  'proj-dha-ph8': { start: '2025-02-01', finish: '2027-01-31' },
  'proj-i11-infra': { start: '2024-12-01', finish: '2026-11-30' },
  'proj-margalla-rd': { start: '2024-10-01', finish: '2027-03-31' },
  'proj-c12-infra': { start: '2025-05-01', finish: '2027-04-30' },
  'proj-attock-byp': { start: '2024-08-01', finish: '2026-07-31' },
  'proj-chakwal-rd': { start: '2025-07-01', finish: '2027-06-30' },
  'proj-d-i-khan': { start: '2024-10-15', finish: '2027-04-30' },
  'proj-hazara-exp': { start: '2025-04-01', finish: '2028-03-31' },
  'proj-thar-coal-rd': { start: '2024-06-01', finish: '2026-09-30' },
  'proj-khi-northern': { start: '2024-09-15', finish: '2027-06-30' },
  'proj-rcd-hwy': { start: '2025-01-01', finish: '2028-06-30' },
  'proj-quetta-wss': { start: '2025-06-15', finish: '2027-12-31' },
};
const LIFECYCLE_SEED: Record<string, { stage: ProjectStage; tocDate?: string; financialCloseDate?: string }> = {
  // TOC issued — in the Recovery section, receivable being collected.
  'proj-attock-byp': { stage: 'physically_completed', tocDate: '2026-03-31' },
  'proj-thar-coal-rd': { stage: 'physically_completed', tocDate: '2026-05-15' },
  // Receivable collected + liabilities cleared — archived as closed.
  'proj-i11-infra': { stage: 'financially_closed', tocDate: '2025-11-30', financialCloseDate: '2026-04-30' },
};

const PROJECTS: Project[] = SEED.map((s) => ({
  id: s.id, pdHqId: s.pdHqId, clientName: s.client,
  contractValue: s.cv, billedToDate: s.billed, receivedToDate: s.received,
  plannedPct: s.planned, actualPct: s.actual,
  commencementDate: DATES[s.id]?.start, completionDate: DATES[s.id]?.finish,
  lat: COORDS[s.id]?.lat, lng: COORDS[s.id]?.lng, location: COORDS[s.id]?.location,
  ...LIFECYCLE_SEED[s.id],
}));

// Deterministic commercial seed for every project, including the flagship, so its
// BOQ, executed progress, vetted IPCs, RAR billing and receipts reconcile.
const SEED_PROFILES: Record<string, SeedProfile> = Object.fromEntries(
  SEED.map((s) => [s.id, {
    id: s.id, cv: Number(s.cv), billed: Number(s.billed),
    plannedPct: s.planned, actualPct: s.actual, start: DATES[s.id]?.start ?? '2025-01-01',
  }]),
);
/** Generated commercial seed for a non-flagship project, or null if unknown. */
function gen(projectId: string): GeneratedSeed | null {
  const p = SEED_PROFILES[projectId];
  return p ? seedFor(p) : null;
}




export class LocalDataProvider implements DataProvider {
  readonly mode = 'local' as const;
  async listNodes(): Promise<OrgNode[]> {
    reconcileSeed();
    const nodes = readJson<OrgNode[]>(nodesKey, () => NODES);
    // Backfill seeded HQ/PD HQ coordinates onto older cached/persisted node
    // sets that predate the geolocation fields, so the maps populate at once.
    const seedCoords = new Map(NODES.filter((n) => n.lat != null).map((n) => [n.id, n] as const));
    for (const n of nodes) {
      if (n.lat == null && seedCoords.has(n.id)) {
        const s = seedCoords.get(n.id)!;
        n.lat = s.lat; n.lng = s.lng; n.location = n.location ?? s.location;
      }
    }
    const archived = new Set(this.readProjectsRaw().filter((p) => p.archived).map((p) => p.id));
    return nodes.filter((n) => !(n.type === 'project' && archived.has(n.id)));
  }
  async listProjects(): Promise<Project[]> {
    return this.readProjectsRaw().filter((p) => !p.archived);
  }
  private readProjectsRaw(): Project[] {
    reconcileSeed();
    return readJson<Project[]>(projectsKey, () => PROJECTS);
  }
  async listArchivedProjects(): Promise<Project[]> {
    return this.readProjectsRaw().filter((p) => p.archived);
  }

  async createProject(input: {
    pdHqId: string; name: string; clientName: string;
    contractValue: string; plannedPct?: number; actualPct?: number;
    projectCode?: string; commencementDate?: string; completionDate?: string;
    lat?: number; lng?: number; location?: string;
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
      // Spec §2: a newly created project stays closed to project staff until its HR is approved.
      hrApproved: false,
      plannedPct: input.plannedPct ?? 0, actualPct: input.actualPct ?? 0,
      projectCode: input.projectCode ? sanitize(input.projectCode) : undefined,
      commencementDate: input.commencementDate || undefined,
      completionDate: input.completionDate || undefined,
      lat: typeof input.lat === 'number' ? input.lat : undefined,
      lng: typeof input.lng === 'number' ? input.lng : undefined,
      location: input.location ? sanitize(input.location) : undefined,
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
    if (patch.location) p.location = sanitize(patch.location);
    if (patch.projectCode) p.projectCode = sanitize(patch.projectCode);
    writeJson(projectsKey, projects);
    audit(projectId, 'update', 'Project', projectId, Object.keys(patch).join(', '));
    return p;
  }

  async updateNodeLocation(nodeId: string, patch: { lat?: number; lng?: number; location?: string }): Promise<OrgNode> {
    const nodes = readJson<OrgNode[]>(nodesKey, () => NODES);
    const node = nodes.find((x) => x.id === nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    if (patch.lat !== undefined) node.lat = patch.lat;
    if (patch.lng !== undefined) node.lng = patch.lng;
    if (patch.location !== undefined) node.location = sanitize(patch.location);
    writeJson(nodesKey, nodes);
    audit(nodeId, 'update', 'Node', node.name, 'location');
    return node;
  }

  async setProjectStage(projectId: string, stage: ProjectStage, date?: string): Promise<Project> {
    const projects = this.readProjectsRaw();
    const p = projects.find((x) => x.id === projectId);
    if (!p) throw new Error('project not found');
    p.stage = stage;
    const d = date ?? new Date().toISOString().slice(0, 10);
    if (stage === 'physically_completed') { p.tocDate = d; p.financialCloseDate = undefined; }
    if (stage === 'financially_closed') { p.financialCloseDate = d; p.tocDate = p.tocDate ?? d; }
    if (stage === 'ongoing') { p.tocDate = undefined; p.financialCloseDate = undefined; }
    writeJson(projectsKey, projects);
    audit(projectId, stage === 'physically_completed' ? 'toc' : stage === 'financially_closed' ? 'fin_close' : 'reopen', 'Project', projectId, d);
    return JSON.parse(JSON.stringify(p)) as Project;
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

  async listAttachments(projectId: string, entity: string, reference: string): Promise<Attachment[]> {
    return readJson<Attachment[]>(attachKey(projectId), () => []).filter((a) => a.entity === entity && a.ref === reference);
  }
  async addAttachment(projectId: string, input: { entity: string; reference: string; name: string; dataUrl: string; mime: string; size: number; dated: string; note?: string }): Promise<Attachment> {
    const all = readJson<Attachment[]>(attachKey(projectId), () => []);
    const att: Attachment = {
      id: `att-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, projectId,
      entity: input.entity, ref: input.reference, name: sanitize(input.name), dataUrl: input.dataUrl,
      mime: input.mime, size: input.size, dated: input.dated, note: input.note ? sanitize(input.note) : undefined,
    };
    all.push(att);
    writeJson(attachKey(projectId), all);
    audit(projectId, 'attach', input.entity, input.reference, att.name);
    return att;
  }
  async deleteAttachment(projectId: string, id: string): Promise<void> {
    const all = readJson<Attachment[]>(attachKey(projectId), () => []);
    const att = all.find((a) => a.id === id);
    writeJson(attachKey(projectId), all.filter((a) => a.id !== id));
    if (att) audit(projectId, 'detach', att.entity, att.ref, att.name);
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
      store.setItem(commentKey(nodeId), JSON.stringify(all));
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

  async getBoqWorkflow(projectId: string): Promise<BoqWorkflowState> {
    return readJson(boqWfKey(projectId), () => INITIAL_BOQ_WORKFLOW);
  }
  async advanceBoqWorkflow(projectId: string, role: string): Promise<BoqWorkflowState> {
    const cur = readJson<BoqWorkflowState>(boqWfKey(projectId), () => INITIAL_BOQ_WORKFLOW);
    const stage = pendingBoqStage(cur);
    const { state, error } = advanceBoq(cur, role);
    if (error) throw new Error(error);
    writeJson(boqWfKey(projectId), state);
    audit(projectId, stage?.action ?? 'advance', 'BOQ', cur.phase === 'vo' ? 'VO' : 'BOQ', `${ROLE_LABEL[role] ?? role}${state.locked ? ' → locked' : ''}`);
    return state;
  }
  async raiseBoqVo(projectId: string): Promise<BoqWorkflowState> {
    const cur = readJson<BoqWorkflowState>(boqWfKey(projectId), () => INITIAL_BOQ_WORKFLOW);
    const { state, error } = raiseVo(cur);
    if (error) throw new Error(error);
    writeJson(boqWfKey(projectId), state);
    audit(projectId, 'raise_vo', 'BOQ', 'VO', `VO #${state.voCount} opened for editing`);
    return state;
  }

  async listAllocations(projectId: string): Promise<Allocation[]> {
    return readJson(allocKey(projectId), () => []);
  }
  async upsertAllocation(projectId: string, input: Omit<Allocation, 'id' | 'projectId'> & { id?: string }): Promise<Allocation[]> {
    const all = readJson<Allocation[]>(allocKey(projectId), () => []);
    if (input.id) {
      const a = all.find((x) => x.id === input.id);
      if (a) Object.assign(a, { ...input, id: a.id, projectId });
    } else {
      all.push({ id: `alloc-${projectId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`, projectId, boqItemId: input.boqItemId, executionType: input.executionType, contractorId: input.contractorId, qty: input.qty, rate: input.rate });
    }
    writeJson(allocKey(projectId), all);
    return all;
  }
  async deleteAllocation(projectId: string, id: string): Promise<Allocation[]> {
    const all = readJson<Allocation[]>(allocKey(projectId), () => []).filter((a) => a.id !== id);
    writeJson(allocKey(projectId), all);
    return all;
  }
  async listContractApprovals(projectId: string): Promise<ContractApproval[]> {
    return readJson(contractKey(projectId), () => []);
  }
  async approveContract(projectId: string, key: string, role: string, value: number): Promise<ContractApproval[]> {
    const all = readJson<ContractApproval[]>(contractKey(projectId), () => []);
    let rec = all.find((c) => c.key === key);
    if (!rec) { rec = { key, status: 'draft' }; all.push(rec); }
    rec.status = 'locked';
    rec.approvedBy = role;
    rec.at = new Date().toISOString();
    writeJson(contractKey(projectId), all);
    audit(projectId, 'approve', 'Contract', key, `${ROLE_LABEL[role] ?? role} · ${value}`);
    return all;
  }
  // ---- Commercial: IPC ----
  async listIpcs(projectId: string): Promise<Ipc[]> {
    return readIpcs(projectId);
  }
  async createIpc(projectId: string, input: { period: string; gross: number; date?: string; lines?: import('./types').IpcLine[] }): Promise<Ipc> {
    const all = readIpcs(projectId);
    const seq = all.reduce((m, i) => Math.max(m, i.seq), 0) + 1;
    const prevCum = all.reduce((m, i) => Math.max(m, i.cumGross), 0);
    const gross = input.lines && input.lines.length ? input.lines.reduce((a, l) => a + l.amount, 0) : input.gross;
    const ipc: Ipc = {
      id: `ipc-${projectId}-${seq}`,
      projectId,
      ipcNo: `IPC-${String(seq).padStart(2, '0')}`,
      seq,
      period: input.period,
      date: input.date,
      status: 'draft',
      gross,
      netPayable: computeNet(gross),
      cumGross: prevCum + gross,
      lines: input.lines,
    };
    all.push(ipc);
    writeJson(ipcKey(projectId), all);
    audit(projectId, 'create', 'IPC', ipc.ipcNo, `${input.lines?.length ?? 0} items`);
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
    return readJson(subKey(projectId), () => ((gen(projectId)?.subs ?? SEED_SUBS)));
  }
  async addSubcontractor(projectId: string, input: { name: string; trade: string }): Promise<Subcontractor> {
    const all = readJson<Subcontractor[]>(subKey(projectId), () => ((gen(projectId)?.subs ?? SEED_SUBS)));
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
  async updateSubcontractor(projectId: string, id: string, patch: Partial<Omit<Subcontractor, 'id' | 'projectId'>>): Promise<Subcontractor> {
    const all = readJson<Subcontractor[]>(subKey(projectId), () => ((gen(projectId)?.subs ?? SEED_SUBS)));
    const s = all.find((x) => x.id === id);
    if (!s) throw new Error(`Subcontractor ${id} not found`);
    Object.assign(s, patch);
    if (patch.name) s.name = sanitize(patch.name);
    if (patch.owner) s.owner = sanitize(patch.owner);
    if (patch.address) s.address = sanitize(patch.address);
    writeJson(subKey(projectId), all);
    return s;
  }

  // ---- RAR ----
  async listRars(projectId: string): Promise<Rar[]> {
    return readJson(rarKey(projectId), () => ((gen(projectId)?.rars ?? SEED_RARS)));
  }
  async createRar(
    projectId: string,
    input: { period: string; subcontractorId: string; contractId?: string; gross: number; date?: string; lines?: RarLine[] },
  ): Promise<Rar> {
    const all = readJson<Rar[]>(rarKey(projectId), () => ((gen(projectId)?.rars ?? SEED_RARS)));
    const seq = all.reduce((m, r) => Math.max(m, r.seq), 0) + 1;
    // RAR net = gross − subcontractor retention (per contract, ≤5%) − project taxes.
    const contracts = readJson<Contract[]>(contractsRegKey(projectId), () => ((gen(projectId)?.contracts ?? SEED_CONTRACTS)));
    const contract = input.contractId ? contracts.find((c) => c.id === input.contractId) : undefined;
    const retentionPct = Math.min(5, contract?.retentionPct ?? DEFAULT_CONTRACT_RETENTION_PCT);
    const cfg = readJson<CommercialConfig>(commCfgKey(projectId), () => ({ ...DEFAULT_COMMERCIAL_CONFIG }));
    const netPayable = computeNet(input.gross, { retentionPct, incomeTaxPct: cfg.rarIncomeTaxPct, gstPct: cfg.rarGstPct });
    const rar: Rar = {
      id: `rar-${projectId}-${seq}`,
      projectId,
      rarNo: `RAR-${String(seq).padStart(2, '0')}`,
      seq,
      period: input.period,
      date: input.date,
      status: 'draft',
      subcontractorId: input.subcontractorId,
      contractId: input.contractId,
      gross: input.gross,
      netPayable,
      lines: input.lines,
    };
    all.push(rar);
    writeJson(rarKey(projectId), all);
    audit(projectId, 'create', 'RAR', rar.rarNo, `PKR ${Math.round(rar.gross).toLocaleString('en-PK')} · retention ${retentionPct}%`);
    return rar;
  }
  async transitionRar(projectId: string, rarNo: string, action: string): Promise<Rar> {
    const all = readJson<Rar[]>(rarKey(projectId), () => (gen(projectId)?.rars ?? SEED_RARS));
    const rar = all.find((r) => r.rarNo === rarNo);
    if (!rar) throw new Error(`RAR ${rarNo} not found`);
    const to = applyRarAction(rar.status, action);
    if (!to) throw new Error(`Illegal transition: ${rar.status} via ${action}`);
    rar.status = to;
    writeJson(rarKey(projectId), all);
    audit(projectId, action, 'RAR', rar.rarNo, `→ ${to}`);
    return rar;
  }
  private mutateRarChain(projectId: string, rarNo: string, fn: (r: Rar) => Rar, action: string, by: string): Rar {
    const all = readJson<Rar[]>(rarKey(projectId), () => (gen(projectId)?.rars ?? SEED_RARS));
    const idx = all.findIndex((r) => r.rarNo === rarNo);
    if (idx < 0) throw new Error(`RAR ${rarNo} not found`);
    all[idx] = fn(all[idx]);
    writeJson(rarKey(projectId), all);
    audit(projectId, action, 'RAR', rarNo, by);
    return JSON.parse(JSON.stringify(all[idx])) as Rar;
  }
  async submitRarApproval(projectId: string, rarNo: string, by: string): Promise<Rar> {
    return this.mutateRarChain(projectId, rarNo, (r) => ({ ...r, chain: newChain(rarApprovalChain()) }), 'submit_approval', by);
  }
  async actOnRar(projectId: string, rarNo: string, by: string, remarks?: string): Promise<Rar> {
    return this.mutateRarChain(projectId, rarNo, (r) => {
      if (!r.chain) return r;
      const chain = act(r.chain, by, remarks);
      // Final act = SM Finance pays & issues cheque (spec §5): the RAR lands paid.
      return { ...r, chain, status: chain.status === 'approved' ? 'paid' : r.status };
    }, 'chain_act', by);
  }
  async returnRar(projectId: string, rarNo: string, by: string, remarks: string): Promise<Rar> {
    return this.mutateRarChain(projectId, rarNo, (r) => (r.chain ? { ...r, chain: returnForCorrection(r.chain, by, remarks) } : r), 'chain_return', by);
  }
  async resubmitRar(projectId: string, rarNo: string, by: string): Promise<Rar> {
    return this.mutateRarChain(projectId, rarNo, (r) => (r.chain ? { ...r, chain: resubmit(r.chain, by, rarApprovalChain()) } : r), 'chain_resubmit', by);
  }
  async setRarFinal(projectId: string, rarNo: string, isFinal: boolean): Promise<Rar> {
    const all = readJson<Rar[]>(rarKey(projectId), () => (gen(projectId)?.rars ?? SEED_RARS));
    const rar = all.find((r) => r.rarNo === rarNo);
    if (!rar) throw new Error(`RAR ${rarNo} not found`);
    rar.isFinal = isFinal;
    rar.chainStage = 0;
    writeJson(rarKey(projectId), all);
    audit(projectId, isFinal ? 'mark_final' : 'mark_interim', 'RAR', rar.rarNo);
    return rar;
  }
  async setRarRecoveriesNetted(projectId: string, rarNo: string, netted: boolean): Promise<Rar> {
    const all = readJson<Rar[]>(rarKey(projectId), () => (gen(projectId)?.rars ?? SEED_RARS));
    const rar = all.find((r) => r.rarNo === rarNo);
    if (!rar) throw new Error(`RAR ${rarNo} not found`);
    rar.recoveriesNetted = netted;
    writeJson(rarKey(projectId), all);
    audit(projectId, netted ? 'recoveries_netted' : 'recoveries_unset', 'RAR', rar.rarNo);
    return rar;
  }
  async setRarRecoveries(projectId: string, rarNo: string, recoveries: RarRecovery[]): Promise<Rar> {
    const all = readJson<Rar[]>(rarKey(projectId), () => (gen(projectId)?.rars ?? SEED_RARS));
    const rar = all.find((r) => r.rarNo === rarNo);
    if (!rar) throw new Error(`RAR ${rarNo} not found`);
    const clean = recoveries
      .map((r, i) => ({ id: r.id || `rec-${projectId}-${rarNo}-${i}`, kind: r.kind, description: sanitize(r.description ?? ''), amount: Math.max(0, Number(r.amount) || 0) }))
      .filter((r) => r.amount > 0 || r.description);
    rar.recoveries = clean;
    // Recompute net: gross − contract retention − RAR taxes − recoveries.
    const contracts = readJson<Contract[]>(contractsRegKey(projectId), () => ((gen(projectId)?.contracts ?? SEED_CONTRACTS)));
    const contract = rar.contractId ? contracts.find((c) => c.id === rar.contractId) : undefined;
    const retentionPct = Math.min(5, contract?.retentionPct ?? DEFAULT_CONTRACT_RETENTION_PCT);
    const cfg = readJson<CommercialConfig>(commCfgKey(projectId), () => ({ ...DEFAULT_COMMERCIAL_CONFIG }));
    const recoveryTotal = clean.reduce((s, r) => s + r.amount, 0);
    rar.netPayable = computeNet(rar.gross, { retentionPct, incomeTaxPct: cfg.rarIncomeTaxPct, gstPct: cfg.rarGstPct }) - recoveryTotal;
    writeJson(rarKey(projectId), all);
    audit(projectId, 'recoveries', 'RAR', rar.rarNo, `${clean.length} item(s) · PKR ${Math.round(recoveryTotal).toLocaleString('en-PK')}`);
    return rar;
  }
  async advanceRarChain(projectId: string, rarNo: string, role: string): Promise<Rar> {
    const all = readJson<Rar[]>(rarKey(projectId), () => (gen(projectId)?.rars ?? SEED_RARS));
    const rar = all.find((r) => r.rarNo === rarNo);
    if (!rar) throw new Error(`RAR ${rarNo} not found`);
    const state = { isFinal: !!rar.isFinal, stageIndex: rar.chainStage ?? 0 };
    const stage = pendingRarStage(state);
    // Recoveries-first gate: the final pay step is blocked until due recoveries are netted.
    if (stage?.action === 'pay') {
      const advances = readJson<Advance[]>(advKey(projectId), () => []);
      const due = advances.filter((a) => a.direction === 'sub_disbursement' && a.subcontractorId === rar.subcontractorId)
        .reduce((s, a) => s + a.amount, 0);
      if (due > 0 && !rar.recoveriesNetted) {
        throw new Error('Due recoveries must be netted before payment.');
      }
    }
    const { state: next, error } = advanceRar(state, role);
    if (error) throw new Error(error);
    rar.chainStage = next.stageIndex;
    if (isRarPaid(next)) rar.status = 'paid';
    writeJson(rarKey(projectId), all);
    audit(projectId, stage?.action ?? 'advance', 'RAR', rar.rarNo, `${ROLE_LABEL[role] ?? role}${isRarPaid(next) ? ' → paid' : ''}`);
    return rar;
  }
  async setRarNote(projectId: string, rarNo: string, note: string): Promise<Rar> {
    const all = readJson<Rar[]>(rarKey(projectId), () => (gen(projectId)?.rars ?? SEED_RARS));
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
  async createEpc(projectId: string, input: { period: string; amount: number; ipcNo?: string }): Promise<Epc> {
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
      ipcNo: input.ipcNo,
    };
    all.push(epc);
    writeJson(epcKey(projectId), all);
    audit(projectId, 'create', 'EPC', epc.epcNo, input.ipcNo ? `for ${input.ipcNo}` : undefined);
    return epc;
  }
  async listEscalationComponents(projectId: string): Promise<EscalationComponent[]> {
    return readJson(escIdxKey(projectId), () => DEFAULT_PBS_COMPONENTS);
  }
  async setEscalationComponents(projectId: string, components: EscalationComponent[]): Promise<void> {
    writeJson(escIdxKey(projectId), components);
  }
  async listVariations(projectId: string): Promise<Variation[]> {
    return readJson(voKey(projectId), () => ((gen(projectId)?.variations ?? SEED_VARIATIONS)));
  }
  async createVariation(projectId: string, input: { title: string; type?: Variation['type']; amount?: number; boqItemId?: string; date?: string; lines?: VariationLine[] }): Promise<Variation> {
    const all = readJson<Variation[]>(voKey(projectId), () => ((gen(projectId)?.variations ?? SEED_VARIATIONS)));
    const seq = all.reduce((m, v) => Math.max(m, v.seq), 0) + 1;
    const boq = readBoq(projectId);
    const amount = input.lines && input.lines.length ? variationLinesAmount(input.lines, boq) : (input.amount ?? 0);
    const type = input.lines && input.lines.length ? dominantVariationType(input.lines) : (input.type ?? 'addition');
    const vo: Variation = {
      id: `vo-${projectId}-${seq}`, projectId, voNo: `VO-${String(seq).padStart(2, '0')}`, seq,
      title: sanitize(input.title), type, amount, status: 'draft',
      boqItemId: input.boqItemId, date: input.date, lines: input.lines,
    };
    all.push(vo);
    writeJson(voKey(projectId), all);
    audit(projectId, 'create', 'Variation', vo.voNo, `${amount >= 0 ? '+' : ''}PKR ${Math.round(amount).toLocaleString('en-PK')}`);
    return vo;
  }
  async transitionVariation(projectId: string, voNo: string, action: string): Promise<Variation> {
    const all = readJson<Variation[]>(voKey(projectId), () => ((gen(projectId)?.variations ?? SEED_VARIATIONS)));
    const vo = all.find((v) => v.voNo === voNo);
    if (!vo) throw new Error(`Variation ${voNo} not found`);
    const next = applyVoAction(vo.status, action);
    if (next) {
      vo.status = next;
      if (next === 'approved' && vo.lines && vo.lines.length && !vo.appliedToBoq) {
        const revised = applyVariationToBoq(readBoq(projectId), vo);
        writeJson(boqKey(projectId), revised);
        vo.appliedToBoq = true;
        audit(projectId, 'apply', 'Variation', vo.voNo, 'BOQ revised');
      }
      writeJson(voKey(projectId), all);
      audit(projectId, 'transition', 'Variation', vo.voNo, next);
    }
    return vo;
  }
  async listContracts(projectId: string): Promise<Contract[]> {
    return readJson(contractsRegKey(projectId), () => ((gen(projectId)?.contracts ?? SEED_CONTRACTS)));
  }
  async createContract(projectId: string, input: { title: string; subcontractorId: string; scopeBills: string[]; value: number; awardDate?: string; retentionPct?: number }): Promise<Contract> {
    const all = readJson<Contract[]>(contractsRegKey(projectId), () => ((gen(projectId)?.contracts ?? SEED_CONTRACTS)));
    const seq = all.reduce((m, c) => Math.max(m, Number(c.contractNo.split('-').pop()) || 0), 0) + 1;
    const c: Contract = {
      id: `ctr-${projectId}-${seq}`, projectId, contractNo: `NLC/${projectId.replace('proj-', '').toUpperCase()}/SC-${String(seq).padStart(2, '0')}`,
      title: sanitize(input.title), subcontractorId: input.subcontractorId, scopeBills: input.scopeBills, value: input.value,
      // Spec §4: a new contract is DRAFT until its approval chain completes (award = freeze point).
      awardDate: input.awardDate, status: input.awardDate ? 'awarded' : 'draft',
      retentionPct: input.retentionPct ?? DEFAULT_CONTRACT_RETENTION_PCT,
    };
    all.push(c);
    writeJson(contractsRegKey(projectId), all);
    audit(projectId, 'create', 'Contract', c.contractNo, `PKR ${Math.round(c.value).toLocaleString('en-PK')} · retention ${c.retentionPct}%`);
    return c;
  }
  async setContractStatus(projectId: string, contractId: string, status: Contract['status']): Promise<void> {
    const all = readJson<Contract[]>(contractsRegKey(projectId), () => ((gen(projectId)?.contracts ?? SEED_CONTRACTS)));
    const c = all.find((x) => x.id === contractId);
    if (c) { c.status = status; writeJson(contractsRegKey(projectId), all); audit(projectId, 'status', 'Contract', c.contractNo, status); }
  }
  async setContractRetention(projectId: string, contractId: string, retentionPct: number): Promise<void> {
    const all = readJson<Contract[]>(contractsRegKey(projectId), () => ((gen(projectId)?.contracts ?? SEED_CONTRACTS)));
    const c = all.find((x) => x.id === contractId);
    if (c) {
      c.retentionPct = Math.max(0, Math.min(5, retentionPct)); // capped at 5% of contract value
      writeJson(contractsRegKey(projectId), all);
      audit(projectId, 'retention', 'Contract', c.contractNo, `${c.retentionPct}%`);
    }
  }
  async getCommercialConfig(projectId: string): Promise<CommercialConfig> {
    return readJson(commCfgKey(projectId), () => ({ ...DEFAULT_COMMERCIAL_CONFIG }));
  }
  async setCommercialConfig(projectId: string, config: CommercialConfig): Promise<CommercialConfig> {
    const clean: CommercialConfig = {
      ipcRetentionPct: clampPct(config.ipcRetentionPct),
      incomeTaxPct: clampPct(config.incomeTaxPct),
      gstPct: clampPct(config.gstPct),
      rarIncomeTaxPct: clampPct(config.rarIncomeTaxPct),
      rarGstPct: clampPct(config.rarGstPct),
      divergenceTolerancePct: clampPct(config.divergenceTolerancePct ?? 10),
    };
    writeJson(commCfgKey(projectId), clean);
    audit(projectId, 'config', 'Commercial', 'deductions', `ret ${clean.ipcRetentionPct}% · tax ${clean.incomeTaxPct}% · gst ${clean.gstPct}%`);
    return clean;
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
  async listBankGuarantees(projectId: string): Promise<BankGuarantee[]> {
    return readJson(bgKey(projectId), () => ((gen(projectId)?.bgs ?? SEED_BGS)));
  }
  async addBankGuarantee(projectId: string, input: Omit<BankGuarantee, 'id' | 'projectId'>): Promise<BankGuarantee> {
    const all = readJson<BankGuarantee[]>(bgKey(projectId), () => ((gen(projectId)?.bgs ?? SEED_BGS)));
    const bg: BankGuarantee = { id: `bg-${Date.now()}`, projectId, ...input, bgNo: sanitize(input.bgNo), bank: sanitize(input.bank) };
    all.push(bg);
    writeJson(bgKey(projectId), all);
    audit(projectId, 'add', 'BankGuarantee', bg.bgNo, `PKR ${Math.round(bg.amount).toLocaleString('en-PK')}`);
    return bg;
  }
  async setBankGuaranteeStatus(projectId: string, id: string, status: BankGuarantee['status']): Promise<BankGuarantee[]> {
    const all = readJson<BankGuarantee[]>(bgKey(projectId), () => ((gen(projectId)?.bgs ?? SEED_BGS)));
    const bg = all.find((x) => x.id === id);
    if (bg) { bg.status = status; writeJson(bgKey(projectId), all); audit(projectId, 'update', 'BankGuarantee', bg.bgNo, status); }
    return all;
  }

  // ---- Distributions ----
  async listDistributions(projectId: string): Promise<Distribution[]> {
    return readJson(distKey(projectId), () => ((gen(projectId)?.distributions ?? SEED_DISTRIBUTIONS)));
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
    return readJson(schedKey(projectId), () => ((gen(projectId)?.schedule ?? SEED_SCHEDULE)));
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

  async getScheduleWorkflow(projectId: string): Promise<BaselineWorkflowState> {
    return readJson(schedWfKey(projectId), () => INITIAL_BASELINE_WORKFLOW);
  }
  async advanceScheduleWorkflow(projectId: string, role: string): Promise<BaselineWorkflowState> {
    const cur = readJson<BaselineWorkflowState>(schedWfKey(projectId), () => INITIAL_BASELINE_WORKFLOW);
    const stage = pendingBaselineStage(cur);
    const { state, error } = advanceBaseline(cur, role);
    if (error) throw new Error(error);
    writeJson(schedWfKey(projectId), state);
    audit(projectId, stage?.action ?? 'advance', 'Baseline', `rev ${state.revision}`, `${ROLE_LABEL[role] ?? role}${state.locked ? ' → locked' : ''}`);
    return state;
  }
  async amendScheduleBaseline(projectId: string): Promise<BaselineWorkflowState> {
    const cur = readJson<BaselineWorkflowState>(schedWfKey(projectId), () => INITIAL_BASELINE_WORKFLOW);
    const { state, error } = amendBaseline(cur);
    if (error) throw new Error(error);
    writeJson(schedWfKey(projectId), state);
    audit(projectId, 'amend', 'Baseline', `rev ${state.revision}`, 'opened for re-approval');
    return state;
  }

  async listOverheads(projectId: string): Promise<OverheadLine[]> {
    return readJson(overheadKey(projectId), () => ((gen(projectId)?.overheads ?? SEED_OVERHEADS)));
  }
  async upsertOverhead(projectId: string, input: Omit<OverheadLine, 'id' | 'projectId'> & { id?: string }): Promise<OverheadLine[]> {
    const all = readJson<OverheadLine[]>(overheadKey(projectId), () => ((gen(projectId)?.overheads ?? SEED_OVERHEADS)));
    if (input.id) {
      const o = all.find((x) => x.id === input.id);
      if (o) Object.assign(o, { category: sanitize(input.category), month: input.month, plannedCost: input.plannedCost });
    } else {
      all.push({ id: `ovh-${projectId}-${Date.now()}`, projectId, category: sanitize(input.category), month: input.month, plannedCost: input.plannedCost });
    }
    writeJson(overheadKey(projectId), all);
    return all;
  }
  async deleteOverhead(projectId: string, id: string): Promise<OverheadLine[]> {
    const all = readJson<OverheadLine[]>(overheadKey(projectId), () => []).filter((o) => o.id !== id);
    writeJson(overheadKey(projectId), all);
    return all;
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
    return readJson(resKey(projectId), () => ((gen(projectId)?.resources ?? SEED_RESOURCES)));
  }
  async addResource(projectId: string, input: Omit<Resource, 'id' | 'projectId'>): Promise<Resource> {
    const all = readJson<Resource[]>(resKey(projectId), () => ((gen(projectId)?.resources ?? SEED_RESOURCES)));
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
    // Many-to-many: upsert keyed by (boqItemId, activityId).
    const idx = all.findIndex((l) => l.boqItemId === link.boqItemId && l.activityId === link.activityId);
    if (idx >= 0) all[idx] = link;
    else all.push(link);
    writeJson(wbsKey(projectId), all);
    return link;
  }
  async removeBoqWbs(projectId: string, boqItemId: string, activityId: string): Promise<BoqWbsLink[]> {
    const all = readJson<BoqWbsLink[]>(wbsKey(projectId), () => [])
      .filter((l) => !(l.boqItemId === boqItemId && l.activityId === activityId));
    writeJson(wbsKey(projectId), all);
    return all;
  }
  async listBoqMaterial(projectId: string): Promise<BoqMaterialLink[]> {
    return readJson(matKey(projectId), () => gen(projectId)?.matLinks ?? []);
  }
  async setBoqMaterial(projectId: string, link: BoqMaterialLink): Promise<BoqMaterialLink> {
    const all = readJson<BoqMaterialLink[]>(matKey(projectId), () => gen(projectId)?.matLinks ?? []);
    // Composition: one BOQ item consumes MANY materials — upsert by (item, material).
    const idx = all.findIndex((l) => l.boqItemId === link.boqItemId && l.materialRef === link.materialRef);
    if (idx >= 0) all[idx] = link;
    else all.push(link);
    writeJson(matKey(projectId), all);
    return link;
  }
  async removeBoqMaterial(projectId: string, boqItemId: string, materialRef: string): Promise<BoqMaterialLink[]> {
    const all = readJson<BoqMaterialLink[]>(matKey(projectId), () => gen(projectId)?.matLinks ?? [])
      .filter((l) => !(l.boqItemId === boqItemId && l.materialRef === materialRef));
    writeJson(matKey(projectId), all);
    return all;
  }

  // ---- Financial ----
  async listReceipts(projectId: string): Promise<FinancialReceipt[]> {
    return readJson(rcptKey(projectId), () => ((gen(projectId)?.receipts ?? SEED_RECEIPTS)));
  }
  async addReceipt(projectId: string, input: Omit<FinancialReceipt, 'id' | 'projectId'>): Promise<FinancialReceipt> {
    const all = readJson<FinancialReceipt[]>(rcptKey(projectId), () => ((gen(projectId)?.receipts ?? SEED_RECEIPTS)));
    const r: FinancialReceipt = { id: `rcpt-${projectId}-${all.length + 1}`, projectId, ...input, source: sanitize(input.source) };
    all.push(r);
    writeJson(rcptKey(projectId), all);
    return r;
  }
  async listPayments(projectId: string): Promise<FinancialPayment[]> {
    return readJson(payKey(projectId), () => ((gen(projectId)?.payments ?? SEED_PAYMENTS)));
  }
  async addPayment(projectId: string, input: Omit<FinancialPayment, 'id' | 'projectId'>): Promise<FinancialPayment> {
    const all = readJson<FinancialPayment[]>(payKey(projectId), () => ((gen(projectId)?.payments ?? SEED_PAYMENTS)));
    const p: FinancialPayment = { id: `pay-${projectId}-${all.length + 1}`, projectId, ...input };
    all.push(p);
    writeJson(payKey(projectId), all);
    return p;
  }
  async listLiabilities(projectId: string): Promise<FinancialLiability[]> {
    return readJson(liabKey(projectId), () => ((gen(projectId)?.liabilities ?? SEED_LIABILITIES)));
  }
  async addLiability(projectId: string, input: Omit<FinancialLiability, 'id' | 'projectId'>): Promise<FinancialLiability> {
    const all = readJson<FinancialLiability[]>(liabKey(projectId), () => ((gen(projectId)?.liabilities ?? SEED_LIABILITIES)));
    const l: FinancialLiability = { id: `liab-${projectId}-${all.length + 1}`, projectId, ...input, kind: sanitize(input.kind) };
    all.push(l);
    writeJson(liabKey(projectId), all);
    return l;
  }

  // ---- Procurement ----
  async listSuppliers(projectId: string): Promise<Supplier[]> {
    return readJson(supplierKey(projectId), () => ((gen(projectId)?.suppliers ?? SEED_SUPPLIERS)));
  }
  async addSupplier(projectId: string, input: Omit<Supplier, 'id' | 'projectId'>): Promise<Supplier> {
    const all = readJson<Supplier[]>(supplierKey(projectId), () => ((gen(projectId)?.suppliers ?? SEED_SUPPLIERS)));
    const s: Supplier = { id: `sup-${projectId}-${all.length + 1}`, projectId, ...input, name: sanitize(input.name) };
    all.push(s);
    writeJson(supplierKey(projectId), all);
    return s;
  }

  async listDemands(projectId: string): Promise<Demand[]> {
    return readJson(demandKey(projectId), () => ((gen(projectId)?.demands ?? SEED_DEMANDS)));
  }
  async createDemand(
    projectId: string,
    input: { type: DemandType; justification: string; items: DemandItem[] },
  ): Promise<Demand> {
    const all = readJson<Demand[]>(demandKey(projectId), () => ((gen(projectId)?.demands ?? SEED_DEMANDS)));
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

  private async mutateContract(projectId: string, contractId: string, fn: (c: Contract, kind: 'labour' | 'sublet') => Contract, action: string, by: string): Promise<Contract> {
    const all = readJson<Contract[]>(contractsRegKey(projectId), () => gen(projectId)?.contracts ?? SEED_CONTRACTS);
    const idx = all.findIndex((c) => c.id === contractId);
    if (idx < 0) throw new Error('contract not found');
    const subs = readJson<Subcontractor[]>(subKey(projectId), () => gen(projectId)?.subs ?? SEED_SUBS);
    const sub = subs.find((x) => x.id === all[idx].subcontractorId);
    const kind: 'labour' | 'sublet' = sub?.kind === 'labor' ? 'labour' : 'sublet';
    all[idx] = fn(all[idx], kind);
    writeJson(contractsRegKey(projectId), all);
    audit(projectId, action, 'Contract', all[idx].contractNo, by);
    return JSON.parse(JSON.stringify(all[idx])) as Contract;
  }
  async submitContractApproval(projectId: string, contractId: string, by: string): Promise<Contract> {
    return this.mutateContract(projectId, contractId, (c, kind) => (
      { ...c, chain: newChain(contractApprovalChain(kind, c.value)) }
    ), 'submit_approval', by);
  }
  async actOnContract(projectId: string, contractId: string, by: string, remarks?: string): Promise<Contract> {
    return this.mutateContract(projectId, contractId, (c) => {
      if (!c.chain) return c;
      const chain = act(c.chain, by, remarks);
      // Final approval awards the contract (distributed quantities freeze — spec §4).
      return { ...c, chain, status: chain.status === 'approved' && c.status === 'draft' ? 'awarded' : c.status };
    }, 'chain_act', by);
  }
  async returnContract(projectId: string, contractId: string, by: string, remarks: string): Promise<Contract> {
    return this.mutateContract(projectId, contractId, (c) => (
      c.chain ? { ...c, chain: returnForCorrection(c.chain, by, remarks) } : c
    ), 'chain_return', by);
  }
  async resubmitContract(projectId: string, contractId: string, by: string): Promise<Contract> {
    return this.mutateContract(projectId, contractId, (c, kind) => (
      // Rebuild the ladder at the CURRENT value — a revised value re-routes (A4).
      c.chain ? { ...c, chain: resubmit(c.chain, by, contractApprovalChain(kind, c.value)) } : c
    ), 'chain_resubmit', by);
  }
  private mutateHrProposal(projectId: string, id: string, fn: (h: HrProposal) => HrProposal, action: string, by: string): HrProposal {
    const all = readJson<HrProposal[]>(hrPropKey(projectId), () => []);
    const idx = all.findIndex((h) => h.id === id);
    if (idx < 0) throw new Error('HR proposal not found');
    all[idx] = fn(all[idx]);
    writeJson(hrPropKey(projectId), all);
    audit(projectId, action, 'HR proposal', id, by);
    return JSON.parse(JSON.stringify(all[idx])) as HrProposal;
  }
  async listHrProposals(projectId: string): Promise<HrProposal[]> {
    return readJson(hrPropKey(projectId), () => []);
  }
  async createHrProposal(projectId: string, input: { kind: HrProposal['kind']; entries: HrProposalEntry[]; by: string }): Promise<HrProposal> {
    const all = readJson<HrProposal[]>(hrPropKey(projectId), () => []);
    const h: HrProposal = {
      id: `hrp-${projectId}-${all.length + 1}`, projectId, kind: input.kind,
      entries: input.entries.map((e) => ({ ...e, title: sanitize(e.title) })),
      status: 'draft', createdBy: sanitize(input.by), createdAt: new Date().toISOString(),
    };
    all.unshift(h);
    writeJson(hrPropKey(projectId), all);
    audit(projectId, 'create', 'HR proposal', h.id, `${h.entries.length} appointments`);
    return h;
  }
  async submitHrProposal(projectId: string, id: string, by: string): Promise<HrProposal> {
    return this.mutateHrProposal(projectId, id, (h) => {
      const scope = h.kind === 'tohr' ? { kind: 'tohr' as const } : { maxGrade: Math.max(0, ...h.entries.map((e) => e.grade)) };
      return { ...h, status: 'in_chain', chain: newChain(hrApprovalChain(scope)) };
    }, 'submit_approval', by);
  }
  async actOnHrProposal(projectId: string, id: string, by: string, remarks?: string): Promise<HrProposal> {
    const out = this.mutateHrProposal(projectId, id, (h) => {
      if (!h.chain) return h;
      const chain = act(h.chain, by, remarks);
      return { ...h, chain, status: chain.status === 'approved' ? 'approved' : h.status };
    }, 'chain_act', by);
    if (out.status === 'approved') {
      // Spec §2 step 5: approval opens the project level to project staff.
      const projects = this.readProjectsRaw();
      const pr = projects.find((x) => x.id === projectId);
      if (pr && pr.hrApproved === false) { pr.hrApproved = true; writeJson(projectsKey, projects); audit(projectId, 'hr_approved', 'Project', projectId); }
    }
    return out;
  }
  async returnHrProposal(projectId: string, id: string, by: string, remarks: string): Promise<HrProposal> {
    return this.mutateHrProposal(projectId, id, (h) => (h.chain ? { ...h, chain: returnForCorrection(h.chain, by, remarks) } : h), 'chain_return', by);
  }
  async resubmitHrProposal(projectId: string, id: string, by: string): Promise<HrProposal> {
    return this.mutateHrProposal(projectId, id, (h) => {
      if (!h.chain) return h;
      const scope = h.kind === 'tohr' ? { kind: 'tohr' as const } : { maxGrade: Math.max(0, ...h.entries.map((e) => e.grade)) };
      return { ...h, chain: resubmit(h.chain, by, hrApprovalChain(scope)) };
    }, 'chain_resubmit', by);
  }
  async listMarkInputs(): Promise<MarkInput[]> {
    return readJson(MARKINPUTS_KEY, () => []);
  }
  async createMarkInput(input: Omit<MarkInput, 'id' | 'status' | 'at'>): Promise<MarkInput> {
    const all = readJson<MarkInput[]>(MARKINPUTS_KEY, () => []);
    const m: MarkInput = {
      ...input, id: `mi-${Date.now().toString(36)}`, status: 'sent', at: new Date().toISOString(),
      fromUser: sanitize(input.fromUser), text: sanitize(input.text),
    };
    all.unshift(m);
    writeJson(MARKINPUTS_KEY, all);
    audit(input.projectId ?? input.nodeId, 'mark_input', 'Input', m.id, `${m.fromUser} → ${m.toAppointmentId}`);
    return m;
  }
  async acknowledgeMarkInput(id: string, by: string): Promise<MarkInput[]> {
    const all = readJson<MarkInput[]>(MARKINPUTS_KEY, () => []);
    const m = all.find((x) => x.id === id);
    if (m && m.status === 'sent') {
      m.status = 'acknowledged';
      m.ackBy = sanitize(by);
      m.ackAt = new Date().toISOString();
      writeJson(MARKINPUTS_KEY, all);
      audit(m.projectId ?? m.nodeId, 'acknowledge', 'Input', m.id, by);
    }
    return all;
  }
  async listSupplierBills(projectId: string): Promise<SupplierBill[]> {
    return readJson(billKey(projectId), () => []);
  }
  async generateSupplierBillFromCrvs(projectId: string, poIds: string[], _by: string): Promise<SupplierBill> {
    // Bill-from-CRV (spec §6): sum received qtys across the POs' CRVs, priced at master rates.
    const [pos, crvs, master] = await Promise.all([
      this.listPurchaseOrders(projectId), this.listCrvs(projectId), this.listMaterialMaster(projectId),
    ]);
    const rateOf = new Map(master.map((m) => [m.code, m.standardRate]));
    const poSet = new Set(poIds);
    const selectedPos = pos.filter((p) => poSet.has(p.id));
    const supplierId = selectedPos[0]?.supplierId ?? '';
    const relevantCrvs = crvs.filter((c) => poSet.has(c.poId));
    const agg = new Map<string, { qty: number; crvId: string }>();
    for (const c of relevantCrvs) {
      for (const line of c.received) {
        const cur = agg.get(line.code) ?? { qty: 0, crvId: c.id };
        cur.qty += line.qtyReceived;
        agg.set(line.code, cur);
      }
    }
    const lines: SupplierBillLine[] = [...agg.entries()].map(([materialCode, v]) => {
      const rate = rateOf.get(materialCode) ?? 0;
      return { crvId: v.crvId, materialCode, qty: +v.qty.toFixed(2), rate, amount: +(v.qty * rate).toFixed(2) };
    });
    const amount = +lines.reduce((sum, l) => sum + l.amount, 0).toFixed(2);
    const kind: 'central' | 'local' = lines.some((l) => isCentralMaterial(l.materialCode)) ? 'central' : 'local';
    const all = readJson<SupplierBill[]>(billKey(projectId), () => []);
    const bill: SupplierBill = {
      id: `bill-${projectId}-${all.length + 1}`, projectId,
      billNo: `SB-${String(all.length + 1).padStart(2, '0')}`, supplierId,
      poIds: [...poSet], lines, amount, kind, status: 'draft', createdAt: new Date().toISOString(),
    };
    all.unshift(bill);
    writeJson(billKey(projectId), all);
    audit(projectId, 'generate', 'Supplier bill', bill.billNo, `${kind} · ${Math.round(amount)}`);
    return bill;
  }
  private mutateBill(projectId: string, id: string, fn: (b: SupplierBill) => SupplierBill, action: string, by: string): SupplierBill {
    const all = readJson<SupplierBill[]>(billKey(projectId), () => []);
    const idx = all.findIndex((b) => b.id === id);
    if (idx < 0) throw new Error('supplier bill not found');
    all[idx] = fn(all[idx]);
    writeJson(billKey(projectId), all);
    audit(projectId, action, 'Supplier bill', all[idx].billNo, by);
    return JSON.parse(JSON.stringify(all[idx])) as SupplierBill;
  }
  async submitSupplierBill(projectId: string, id: string, by: string): Promise<SupplierBill> {
    return this.mutateBill(projectId, id, (b) => ({ ...b, status: 'in_chain', chain: newChain(supplierBillChain(b.kind)) }), 'submit_approval', by);
  }
  async actOnSupplierBill(projectId: string, id: string, by: string, remarks?: string): Promise<SupplierBill> {
    return this.mutateBill(projectId, id, (b) => {
      if (!b.chain) return b;
      const chain = act(b.chain, by, remarks);
      return { ...b, chain, status: chain.status === 'approved' ? 'paid' : b.status };
    }, 'chain_act', by);
  }
  async returnSupplierBill(projectId: string, id: string, by: string, remarks: string): Promise<SupplierBill> {
    return this.mutateBill(projectId, id, (b) => (b.chain ? { ...b, chain: returnForCorrection(b.chain, by, remarks) } : b), 'chain_return', by);
  }
  async resubmitSupplierBill(projectId: string, id: string, by: string): Promise<SupplierBill> {
    return this.mutateBill(projectId, id, (b) => (b.chain ? { ...b, chain: resubmit(b.chain, by, supplierBillChain(b.kind)) } : b), 'chain_resubmit', by);
  }
  async listDlpDefects(projectId: string): Promise<DlpDefect[]> {
    return readJson(dlpKey(projectId), () => DLP_SEED[projectId] ?? []);
  }
  async createDlpDefect(projectId: string, input: Omit<DlpDefect, 'id' | 'projectId' | 'status'>): Promise<DlpDefect> {
    const all = readJson<DlpDefect[]>(dlpKey(projectId), () => DLP_SEED[projectId] ?? []);
    const d: DlpDefect = {
      ...input, id: `dlp-${projectId}-${all.length + 1}`, projectId, status: 'open',
      description: sanitize(input.description), location: input.location ? sanitize(input.location) : undefined,
    };
    all.push(d);
    writeJson(dlpKey(projectId), all);
    audit(projectId, 'raise', 'DLP defect', d.id, d.description.slice(0, 60));
    return d;
  }
  async setDlpDefectStatus(projectId: string, id: string, status: DlpDefect['status']): Promise<DlpDefect[]> {
    const all = readJson<DlpDefect[]>(dlpKey(projectId), () => DLP_SEED[projectId] ?? []);
    const d = all.find((x) => x.id === id);
    if (d) {
      d.status = status;
      d.rectifiedDate = status === 'rectified' ? new Date().toISOString().slice(0, 10) : undefined;
      writeJson(dlpKey(projectId), all);
      audit(projectId, status === 'rectified' ? 'rectify' : 'reopen', 'DLP defect', d.id, d.description.slice(0, 60));
    }
    return all;
  }
  async listMixDesigns(projectId: string): Promise<MixDesign[]> {
    return readJson(mixKey(projectId), () => DEFAULT_MIX_DESIGNS);
  }
  async upsertMixDesign(projectId: string, design: MixDesign): Promise<MixDesign[]> {
    const all = readJson<MixDesign[]>(mixKey(projectId), () => DEFAULT_MIX_DESIGNS);
    const idx = all.findIndex((m) => m.id === design.id);
    if (idx >= 0) all[idx] = design;
    else all.push(design);
    writeJson(mixKey(projectId), all);
    audit(projectId, 'upsert', 'MixDesign', design.id, design.name);
    return all;
  }
  async listMaterialMaster(projectId: string): Promise<MaterialMaster[]> {
    return readJson(matMasterKey(projectId), () => gen(projectId)?.materialMaster ?? []);
  }
  async upsertMaterialMaster(projectId: string, input: MaterialMaster): Promise<MaterialMaster[]> {
    const all = readJson<MaterialMaster[]>(matMasterKey(projectId), () => gen(projectId)?.materialMaster ?? []);
    const code = sanitize(input.code.trim().toUpperCase());
    const clean: MaterialMaster = { ...input, code, name: sanitize(input.name), unit: sanitize(input.unit), spec: input.spec ? sanitize(input.spec) : undefined };
    const idx = all.findIndex((m) => m.code === code);
    if (idx >= 0) all[idx] = clean;
    else all.push(clean);
    all.sort((a, b) => a.code.localeCompare(b.code));
    writeJson(matMasterKey(projectId), all);
    audit(projectId, 'upsert', 'MaterialMaster', code, `${clean.standardRate}/` + clean.unit);
    return all;
  }
  async deleteMaterialMaster(projectId: string, code: string): Promise<MaterialMaster[]> {
    const all = readJson<MaterialMaster[]>(matMasterKey(projectId), () => gen(projectId)?.materialMaster ?? []).filter((m) => m.code !== code);
    writeJson(matMasterKey(projectId), all);
    return all;
  }
  async listDirectives(): Promise<Directive[]> {
    return readJson(DIRECTIVES_KEY, () => []);
  }
  async createDirective(input: Omit<Directive, 'id' | 'status' | 'responses' | 'createdAt' | 'updatedAt'>): Promise<Directive> {
    const all = readJson<Directive[]>(DIRECTIVES_KEY, () => []);
    const now = new Date().toISOString();
    const d: Directive = {
      ...input, id: `dir-${Date.now().toString(36)}`,
      title: sanitize(input.title), detail: sanitize(input.detail), issuedBy: sanitize(input.issuedBy),
      status: 'issued', responses: [], createdAt: now, updatedAt: now,
    };
    all.unshift(d);
    writeJson(DIRECTIVES_KEY, all);
    audit(input.projectId ?? input.nodeId, 'issue', 'Directive', d.title.slice(0, 40), `to ${d.assigneeRole} by ${d.issuedBy}, due ${d.dueDate}`);
    return d;
  }
  async respondDirective(id: string, by: string, text: string, status?: DirectiveStatus): Promise<Directive[]> {
    const all = readJson<Directive[]>(DIRECTIVES_KEY, () => []);
    const d = all.find((x) => x.id === id);
    if (d) {
      d.responses.push({ id: `dr-${Date.now().toString(36)}`, by: sanitize(by), at: new Date().toISOString(), text: sanitize(text) });
      if (status) d.status = status;
      else if (d.status === 'issued') d.status = 'acknowledged';
      d.updatedAt = new Date().toISOString();
      writeJson(DIRECTIVES_KEY, all);
      audit(d.projectId ?? d.nodeId, 'respond', 'Directive', d.title.slice(0, 40), `${by}${status ? ` → ${status}` : ''}`);
    }
    return all;
  }
  async setDirectiveStatus(id: string, status: DirectiveStatus, by: string): Promise<Directive[]> {
    const all = readJson<Directive[]>(DIRECTIVES_KEY, () => []);
    const d = all.find((x) => x.id === id);
    if (d) {
      d.status = status;
      d.updatedAt = new Date().toISOString();
      writeJson(DIRECTIVES_KEY, all);
      audit(d.projectId ?? d.nodeId, status, 'Directive', d.title.slice(0, 40), by);
    }
    return all;
  }
  async listUsers(): Promise<AppUser[]> {
    return readJson(USERS_KEY, () => SEED_USERS);
  }
  async upsertUser(input: Omit<AppUser, 'id'> & { id?: string }): Promise<AppUser[]> {
    const all = readJson<AppUser[]>(USERS_KEY, () => SEED_USERS);
    if (input.id) {
      const idx = all.findIndex((u) => u.id === input.id);
      if (idx >= 0) all[idx] = { ...all[idx], ...input, name: sanitize(input.name) } as AppUser;
    } else {
      all.push({ id: `u-${Date.now().toString(36)}`, name: sanitize(input.name), role: input.role, nodeId: input.nodeId });
    }
    writeJson(USERS_KEY, all);
    return all;
  }
  async deleteUser(id: string): Promise<AppUser[]> {
    const all = readJson<AppUser[]>(USERS_KEY, () => SEED_USERS).filter((u) => u.id !== id);
    writeJson(USERS_KEY, all);
    return all;
  }
  async listAlertStates(projectId: string): Promise<AlertState[]> {
    return readJson(alertStateKey(projectId), () => []);
  }
  async setAlertState(projectId: string, state: Omit<AlertState, 'updatedAt'>): Promise<AlertState[]> {
    const all = readJson<AlertState[]>(alertStateKey(projectId), () => []);
    const next: AlertState = { ...state, note: state.note ? sanitize(state.note) : undefined, updatedAt: new Date().toISOString() };
    const idx = all.findIndex((a) => a.alertId === state.alertId);
    if (idx >= 0) all[idx] = next;
    else all.push(next);
    writeJson(alertStateKey(projectId), all);
    audit(projectId, state.status, 'Alert', state.alertId, state.note ?? '');
    return all;
  }
  async recordOverride(projectId: string, entity: string, ref: string, detail: string): Promise<void> {
    audit(projectId, 'override', entity, sanitize(ref), sanitize(detail));
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
    return readJson(salientKey(projectId), () => ((gen(projectId)?.salients ?? SEED_SALIENTS)));
  }
  async upsertSalient(projectId: string, input: { id?: string; label: string; value: string }): Promise<Salient> {
    const all = readJson<Salient[]>(salientKey(projectId), () => ((gen(projectId)?.salients ?? SEED_SALIENTS)));
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
    return readJson(prodKey(projectId), () => ((gen(projectId)?.production ?? SEED_PRODUCTION)));
  }
  async createProductionRun(projectId: string, input: Omit<ProductionRun, 'id' | 'projectId'>): Promise<ProductionRun> {
    const all = readJson<ProductionRun[]>(prodKey(projectId), () => ((gen(projectId)?.production ?? SEED_PRODUCTION)));
    const run: ProductionRun = { id: `prod-${projectId}-${all.length + 1}`, projectId, ...input, product: sanitize(input.product) };
    all.push(run);
    all.sort((a, b) => a.dated.localeCompare(b.dated));
    writeJson(prodKey(projectId), all);
    return run;
  }
  async listMaterialIssues(projectId: string): Promise<MaterialIssue[]> {
    return readJson(issueKey(projectId), () => ((gen(projectId)?.issues ?? SEED_ISSUES)));
  }
  async createMaterialIssue(projectId: string, input: Omit<MaterialIssue, 'id' | 'projectId'>): Promise<MaterialIssue> {
    const all = readJson<MaterialIssue[]>(issueKey(projectId), () => ((gen(projectId)?.issues ?? SEED_ISSUES)));
    const iss: MaterialIssue = { id: `mi-${projectId}-${all.length + 1}`, projectId, ...input, materialCode: sanitize(input.materialCode), issuedTo: sanitize(input.issuedTo) };
    all.push(iss);
    all.sort((a, b) => a.dated.localeCompare(b.dated));
    writeJson(issueKey(projectId), all);
    return iss;
  }
  async setMaterialRecovered(projectId: string, id: string, recovered: number): Promise<MaterialIssue[]> {
    const all = readJson<MaterialIssue[]>(issueKey(projectId), () => ((gen(projectId)?.issues ?? SEED_ISSUES)));
    const iss = all.find((x) => x.id === id);
    if (iss) { iss.recovered = recovered; writeJson(issueKey(projectId), all); audit(projectId, 'recover', 'Material', iss.materialCode, `${recovered}`); }
    return all;
  }
  async listMachineryUsage(projectId: string): Promise<MachineryUsage[]> {
    return readJson(machineryKey(projectId), () => (gen(projectId)?.machinery ?? []));
  }
  async createMachineryUsage(projectId: string, input: Omit<MachineryUsage, 'id' | 'projectId'>): Promise<MachineryUsage> {
    const all = readJson<MachineryUsage[]>(machineryKey(projectId), () => (gen(projectId)?.machinery ?? []));
    const m: MachineryUsage = { id: `mu-${projectId}-${all.length + 1}`, projectId, ...input, machineryCode: sanitize(input.machineryCode), description: sanitize(input.description) };
    all.push(m);
    all.sort((a, b) => a.dated.localeCompare(b.dated));
    writeJson(machineryKey(projectId), all);
    audit(projectId, 'create', 'Machinery', m.machineryCode, `${Math.round(m.hours * m.rate)}`);
    return m;
  }
  async setMachineryRecovered(projectId: string, id: string, recovered: number): Promise<MachineryUsage[]> {
    const all = readJson<MachineryUsage[]>(machineryKey(projectId), () => (gen(projectId)?.machinery ?? []));
    const m = all.find((x) => x.id === id);
    if (m) { m.recovered = recovered; writeJson(machineryKey(projectId), all); audit(projectId, 'recover', 'Machinery', m.machineryCode, `${recovered}`); }
    return all;
  }
  async getMappingWorkflow(projectId: string): Promise<BaselineWorkflowState> {
    return readJson(mapWfKey(projectId), () => INITIAL_MAPPING_WORKFLOW);
  }
  async advanceMappingWorkflow(projectId: string, role: string): Promise<BaselineWorkflowState> {
    const cur = readJson<BaselineWorkflowState>(mapWfKey(projectId), () => INITIAL_MAPPING_WORKFLOW);
    const stage = pendingMappingStage(cur);
    const { state, error } = advanceMappingWf(cur, role);
    if (error) throw new Error(error);
    writeJson(mapWfKey(projectId), state);
    audit(projectId, stage?.action ?? 'advance', 'Mapping', `rev ${state.revision}`, `${ROLE_LABEL[role] ?? role}${state.locked ? ' → locked' : ''}`);
    return state;
  }
  async amendMapping(projectId: string): Promise<BaselineWorkflowState> {
    const cur = readJson<BaselineWorkflowState>(mapWfKey(projectId), () => INITIAL_MAPPING_WORKFLOW);
    const { state, error } = amendMappingWf(cur);
    if (error) throw new Error(error);
    writeJson(mapWfKey(projectId), state);
    audit(projectId, 'amend', 'Mapping', `rev ${state.revision}`, 'opened for re-approval');
    return state;
  }

  async listProgress(projectId: string): Promise<ProgressUpdate[]> {
    return readJson(progressKey(projectId), () => gen(projectId)?.progress ?? []);
  }
  async upsertProgress(projectId: string, input: { boqItemId: string; period: string; executedQty: number; role: string; id?: string }): Promise<ProgressUpdate[]> {
    const all = readJson<ProgressUpdate[]>(progressKey(projectId), () => []);
    if (input.id) {
      const u = all.find((x) => x.id === input.id);
      if (u && u.status === 'draft') { u.executedQty = input.executedQty; u.period = input.period; }
    } else {
      all.push({ id: `prog-${projectId}-${Date.now()}`, projectId, boqItemId: input.boqItemId, period: input.period, executedQty: input.executedQty, status: 'draft', enteredBy: input.role });
    }
    writeJson(progressKey(projectId), all);
    audit(projectId, 'enter', 'Progress', input.boqItemId, `${input.executedQty} (${ROLE_LABEL[input.role] ?? input.role})`);
    return all;
  }
  async validateProgress(projectId: string, id: string, role: string): Promise<ProgressUpdate[]> {
    if (role !== 'pm') throw new Error('Only the PM can validate progress.');
    const all = readJson<ProgressUpdate[]>(progressKey(projectId), () => []);
    const u = all.find((x) => x.id === id);
    if (!u) throw new Error('Progress update not found.');
    u.status = 'validated'; u.validatedBy = role;
    writeJson(progressKey(projectId), all);
    audit(projectId, 'validate', 'Progress', u.boqItemId, `${u.executedQty} validated`);
    return all;
  }
  async listHr(nodeId: string): Promise<HrPosting[]> {
    return readJson(hrKey(nodeId), () => SEED_HR[nodeId] ?? []);
  }
  async listAllHr(): Promise<HrPosting[]> {
    const nodes = readJson<OrgNode[]>(nodesKey, () => NODES);
    const out: HrPosting[] = [];
    for (const n of nodes) out.push(...readJson<HrPosting[]>(hrKey(n.id), () => SEED_HR[n.id] ?? []));
    return out;
  }
  async upsertHr(nodeId: string, input: Omit<HrPosting, 'id' | 'nodeId'> & { id?: string }): Promise<HrPosting[]> {
    const all = readJson<HrPosting[]>(hrKey(nodeId), () => SEED_HR[nodeId] ?? []);
    if (input.id) {
      const h = all.find((x) => x.id === input.id);
      if (h) Object.assign(h, { category: sanitize(input.category), sanctioned: input.sanctioned, posted: input.posted });
    } else {
      all.push({ id: `hr-${nodeId}-${Date.now()}`, nodeId, category: sanitize(input.category), sanctioned: input.sanctioned, posted: input.posted });
    }
    writeJson(hrKey(nodeId), all);
    return all;
  }
  async deleteHr(nodeId: string, id: string): Promise<HrPosting[]> {
    const all = readJson<HrPosting[]>(hrKey(nodeId), () => SEED_HR[nodeId] ?? []).filter((h) => h.id !== id);
    writeJson(hrKey(nodeId), all);
    return all;
  }
  async listHrUnits(nodeId: string): Promise<HrUnit[]> {
    return readJson(hrUnitKey(nodeId), () => SEED_HR_UNITS[nodeId] ?? []);
  }
  async listAllHrUnits(): Promise<HrUnit[]> {
    const nodes = readJson<OrgNode[]>(nodesKey, () => NODES);
    const out: HrUnit[] = [];
    for (const n of nodes) out.push(...readJson<HrUnit[]>(hrUnitKey(n.id), () => SEED_HR_UNITS[n.id] ?? []));
    return out;
  }
  async upsertHrUnit(nodeId: string, input: Omit<HrUnit, 'id' | 'nodeId'> & { id?: string }): Promise<HrUnit[]> {
    const all = readJson<HrUnit[]>(hrUnitKey(nodeId), () => SEED_HR_UNITS[nodeId] ?? []);
    const patch = {
      parentId: input.parentId ?? null,
      title: sanitize(input.title),
      scale: input.scale ? sanitize(input.scale) : undefined,
      category: input.category ? sanitize(input.category) : undefined,
      auth: Math.max(0, Math.round(input.auth)),
      held: Math.max(0, Math.round(input.held)),
      order: input.order ?? all.length,
    };
    if (input.id) {
      const u = all.find((x) => x.id === input.id);
      if (u) Object.assign(u, patch);
    } else {
      all.push({ id: `hru-${nodeId}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, nodeId, ...patch });
    }
    writeJson(hrUnitKey(nodeId), all);
    return all;
  }
  async deleteHrUnit(nodeId: string, id: string): Promise<HrUnit[]> {
    // Remove the unit and re-parent its orphans to the deleted unit's parent.
    const all = readJson<HrUnit[]>(hrUnitKey(nodeId), () => SEED_HR_UNITS[nodeId] ?? []);
    const target = all.find((u) => u.id === id);
    const next = all
      .filter((u) => u.id !== id)
      .map((u) => (u.parentId === id ? { ...u, parentId: target?.parentId ?? null } : u));
    writeJson(hrUnitKey(nodeId), next);
    return next;
  }
  async listPeople(nodeId: string): Promise<HrPerson[]> {
    return readJson(peopleKey(nodeId), () => SEED_PEOPLE[nodeId] ?? []);
  }
  async listAllPeople(): Promise<HrPerson[]> {
    const nodes = readJson<OrgNode[]>(nodesKey, () => NODES);
    const out: HrPerson[] = [];
    for (const n of nodes) out.push(...readJson<HrPerson[]>(peopleKey(n.id), () => SEED_PEOPLE[n.id] ?? []));
    return out;
  }
  async upsertPerson(nodeId: string, input: Omit<HrPerson, 'id' | 'nodeId'> & { id?: string }): Promise<HrPerson[]> {
    const all = readJson<HrPerson[]>(peopleKey(nodeId), () => SEED_PEOPLE[nodeId] ?? []);
    const patch = {
      unitId: input.unitId ?? null,
      name: sanitize(input.name),
      rank: input.rank ? sanitize(input.rank) : undefined,
      cnic: input.cnic ? sanitize(input.cnic) : undefined,
      contact: input.contact ? sanitize(input.contact) : undefined,
      photoUrl: input.photoUrl,
      postingDate: input.postingDate,
      status: input.status,
      category: input.category ? sanitize(input.category) : undefined,
    };
    if (input.id) {
      const p = all.find((x) => x.id === input.id);
      if (p) Object.assign(p, patch);
    } else {
      all.push({ id: `per-${nodeId}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, nodeId, ...patch });
    }
    writeJson(peopleKey(nodeId), all);
    return all;
  }
  async deletePerson(nodeId: string, id: string): Promise<HrPerson[]> {
    const all = readJson<HrPerson[]>(peopleKey(nodeId), () => SEED_PEOPLE[nodeId] ?? []).filter((p) => p.id !== id);
    writeJson(peopleKey(nodeId), all);
    return all;
  }
  async listRequisitions(nodeId: string): Promise<HrRequisition[]> {
    return readJson(reqKey(nodeId), () => SEED_REQS[nodeId] ?? []);
  }
  async upsertRequisition(nodeId: string, input: Omit<HrRequisition, 'id' | 'nodeId' | 'raisedAt'> & { id?: string }): Promise<HrRequisition[]> {
    const all = readJson<HrRequisition[]>(reqKey(nodeId), () => SEED_REQS[nodeId] ?? []);
    if (input.id) {
      const r = all.find((x) => x.id === input.id);
      if (r) Object.assign(r, { unitId: input.unitId, title: sanitize(input.title), count: input.count, stage: input.stage, note: input.note ? sanitize(input.note) : undefined });
    } else {
      all.unshift({ id: `req-${nodeId}-${Date.now()}`, nodeId, unitId: input.unitId, title: sanitize(input.title), count: input.count, stage: input.stage, raisedAt: new Date().toISOString(), note: input.note ? sanitize(input.note) : undefined });
    }
    writeJson(reqKey(nodeId), all);
    audit(nodeId, 'requisition', 'HR', sanitize(input.title), input.stage);
    return all;
  }
  async advanceRequisition(nodeId: string, id: string): Promise<HrRequisition[]> {
    const all = readJson<HrRequisition[]>(reqKey(nodeId), () => SEED_REQS[nodeId] ?? []);
    const r = all.find((x) => x.id === id);
    if (r) {
      const i = REQ_STAGES.indexOf(r.stage);
      if (i < REQ_STAGES.length - 1) r.stage = REQ_STAGES[i + 1];
      audit(nodeId, 'requisition-advance', 'HR', r.title, r.stage);
    }
    writeJson(reqKey(nodeId), all);
    return all;
  }
  async deleteRequisition(nodeId: string, id: string): Promise<HrRequisition[]> {
    const all = readJson<HrRequisition[]>(reqKey(nodeId), () => SEED_REQS[nodeId] ?? []).filter((r) => r.id !== id);
    writeJson(reqKey(nodeId), all);
    return all;
  }
  async listCredentials(nodeId: string): Promise<HrCredential[]> {
    return readJson(credKey(nodeId), () => SEED_CREDS[nodeId] ?? []);
  }
  async upsertCredential(nodeId: string, input: Omit<HrCredential, 'id' | 'nodeId'> & { id?: string }): Promise<HrCredential[]> {
    const all = readJson<HrCredential[]>(credKey(nodeId), () => SEED_CREDS[nodeId] ?? []);
    const patch = {
      personId: input.personId, personName: sanitize(input.personName), kind: input.kind,
      ref: sanitize(input.ref), issued: input.issued, expires: input.expires,
      note: input.note ? sanitize(input.note) : undefined,
    };
    if (input.id) {
      const c = all.find((x) => x.id === input.id);
      if (c) Object.assign(c, patch);
    } else {
      all.unshift({ id: `cred-${nodeId}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, nodeId, ...patch });
    }
    writeJson(credKey(nodeId), all);
    return all;
  }
  async deleteCredential(nodeId: string, id: string): Promise<HrCredential[]> {
    const all = readJson<HrCredential[]>(credKey(nodeId), () => SEED_CREDS[nodeId] ?? []).filter((c) => c.id !== id);
    writeJson(credKey(nodeId), all);
    return all;
  }
  async listTransfersForNode(nodeId: string): Promise<HrTransfer[]> {
    const all = readJson<HrTransfer[]>(TRANSFERS_KEY, () => SEED_TRANSFERS);
    return all.filter((t) => t.fromNodeId === nodeId || t.toNodeId === nodeId);
  }
  async raiseTransfer(input: Omit<HrTransfer, 'id' | 'stage' | 'raisedAt'>): Promise<HrTransfer[]> {
    const all = readJson<HrTransfer[]>(TRANSFERS_KEY, () => SEED_TRANSFERS);
    all.unshift({
      ...input, id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      personName: sanitize(input.personName), toUnitTitle: sanitize(input.toUnitTitle),
      reason: input.reason ? sanitize(input.reason) : undefined,
      stage: 'raised', raisedAt: new Date().toISOString(),
    });
    writeJson(TRANSFERS_KEY, all);
    audit(input.toNodeId, 'posting-raise', 'HR', input.personName, `${input.fromNodeName} → ${input.toNodeName}`);
    return all.filter((t) => t.fromNodeId === input.fromNodeId || t.toNodeId === input.toNodeId);
  }
  async advanceTransfer(id: string): Promise<HrTransfer[]> {
    const all = readJson<HrTransfer[]>(TRANSFERS_KEY, () => SEED_TRANSFERS);
    const t = all.find((x) => x.id === id);
    if (t && t.stage !== 'rejected' && t.stage !== 'effected') {
      const i = TRANSFER_ORDER.indexOf(t.stage);
      if (i >= 0 && i < TRANSFER_ORDER.length - 2) { t.stage = TRANSFER_ORDER[i + 1]; audit(t.toNodeId, 'posting-advance', 'HR', t.personName, t.stage); }
    }
    writeJson(TRANSFERS_KEY, all);
    return all.filter((x) => t && (x.fromNodeId === t.fromNodeId || x.toNodeId === t.toNodeId));
  }
  async rejectTransfer(id: string): Promise<HrTransfer[]> {
    const all = readJson<HrTransfer[]>(TRANSFERS_KEY, () => SEED_TRANSFERS);
    const t = all.find((x) => x.id === id);
    if (t) { t.stage = 'rejected'; audit(t.toNodeId, 'posting-reject', 'HR', t.personName, ''); }
    writeJson(TRANSFERS_KEY, all);
    return all.filter((x) => t && (x.fromNodeId === t.fromNodeId || x.toNodeId === t.toNodeId));
  }
  async effectTransfer(id: string): Promise<HrTransfer[]> {
    const all = readJson<HrTransfer[]>(TRANSFERS_KEY, () => SEED_TRANSFERS);
    const t = all.find((x) => x.id === id);
    if (t && t.stage === 'approved') {
      // Move the person record between node stores.
      const fromPeople = readJson<HrPerson[]>(peopleKey(t.fromNodeId), () => SEED_PEOPLE[t.fromNodeId] ?? []);
      const person = fromPeople.find((p) => p.id === t.personId);
      if (person) {
        if (t.fromNodeId === t.toNodeId) {
          person.unitId = t.toUnitId;
        } else {
          const remaining = fromPeople.filter((p) => p.id !== t.personId);
          writeJson(peopleKey(t.fromNodeId), remaining);
          const toPeople = readJson<HrPerson[]>(peopleKey(t.toNodeId), () => SEED_PEOPLE[t.toNodeId] ?? []);
          toPeople.push({ ...person, nodeId: t.toNodeId, unitId: t.toUnitId });
          writeJson(peopleKey(t.toNodeId), toPeople);
        }
        if (t.fromNodeId === t.toNodeId) writeJson(peopleKey(t.fromNodeId), fromPeople);
      }
      t.stage = 'effected';
      t.effectiveDate = new Date().toISOString().slice(0, 10);
      audit(t.toNodeId, 'posting-effect', 'HR', t.personName, `${t.fromNodeName} → ${t.toNodeName}`);
    }
    writeJson(TRANSFERS_KEY, all);
    return all.filter((x) => t && (x.fromNodeId === t.fromNodeId || x.toNodeId === t.toNodeId));
  }
  async deleteTransfer(id: string): Promise<HrTransfer[]> {
    const all = readJson<HrTransfer[]>(TRANSFERS_KEY, () => SEED_TRANSFERS);
    const t = all.find((x) => x.id === id);
    const next = all.filter((x) => x.id !== id);
    writeJson(TRANSFERS_KEY, next);
    return next.filter((x) => t && (x.fromNodeId === t.fromNodeId || x.toNodeId === t.toNodeId));
  }
  async listEstablishmentVersions(nodeId: string): Promise<HrEstablishmentVersion[]> {
    return readJson(versionKey(nodeId), () => []);
  }
  async snapshotEstablishment(nodeId: string, label: string): Promise<HrEstablishmentVersion[]> {
    const all = readJson<HrEstablishmentVersion[]>(versionKey(nodeId), () => []);
    const units = readJson<HrUnit[]>(hrUnitKey(nodeId), () => SEED_HR_UNITS[nodeId] ?? []);
    const version = (all.reduce((m, v) => Math.max(m, v.version), 0)) + 1;
    all.unshift({
      id: `ver-${nodeId}-${Date.now()}`, nodeId, version, label: sanitize(label) || `Snapshot v${version}`,
      status: 'draft', createdAt: new Date().toISOString(), snapshot: JSON.parse(JSON.stringify(units)),
    });
    writeJson(versionKey(nodeId), all);
    audit(nodeId, 'establishment-snapshot', 'HR', `v${version}`, label);
    return all;
  }
  async sanctionEstablishmentVersion(nodeId: string, id: string, approvedBy: string): Promise<HrEstablishmentVersion[]> {
    const all = readJson<HrEstablishmentVersion[]>(versionKey(nodeId), () => []);
    const v = all.find((x) => x.id === id);
    if (v) { v.status = 'sanctioned'; v.approvedBy = sanitize(approvedBy); audit(nodeId, 'establishment-sanction', 'HR', `v${v.version}`, approvedBy); }
    writeJson(versionKey(nodeId), all);
    return all;
  }
  async deleteEstablishmentVersion(nodeId: string, id: string): Promise<HrEstablishmentVersion[]> {
    const all = readJson<HrEstablishmentVersion[]>(versionKey(nodeId), () => []).filter((v) => v.id !== id);
    writeJson(versionKey(nodeId), all);
    return all;
  }
  async listInventory(projectId: string): Promise<InventoryItem[]> {
    return readJson(invKey(projectId), () => ((gen(projectId)?.inventory ?? SEED_INVENTORY)));
  }
  async upsertInventory(projectId: string, input: Omit<InventoryItem, 'id' | 'projectId'> & { id?: string }): Promise<InventoryItem[]> {
    const all = readJson<InventoryItem[]>(invKey(projectId), () => ((gen(projectId)?.inventory ?? SEED_INVENTORY)));
    if (input.id) {
      const it = all.find((x) => x.id === input.id);
      if (it) Object.assign(it, { ...input, id: it.id, projectId, name: sanitize(input.name), regNo: sanitize(input.regNo) });
    } else {
      all.push({ id: `inv-${projectId}-${Date.now()}`, projectId, kind: input.kind, ownership: input.ownership, name: sanitize(input.name), regNo: sanitize(input.regNo), status: input.status, utilizationPct: input.utilizationPct });
    }
    writeJson(invKey(projectId), all);
    return all;
  }
  async listPol(projectId: string): Promise<PolRecord[]> {
    return readJson(polKey(projectId), () => ((gen(projectId)?.pol ?? SEED_POL)));
  }
  async addPol(projectId: string, input: Omit<PolRecord, 'id' | 'projectId'>): Promise<PolRecord[]> {
    const all = readJson<PolRecord[]>(polKey(projectId), () => ((gen(projectId)?.pol ?? SEED_POL)));
    all.push({ id: `pol-${projectId}-${Date.now()}`, projectId, ...input });
    writeJson(polKey(projectId), all);
    return all;
  }
  async listFixedAssets(projectId: string): Promise<FixedAsset[]> {
    return readJson(faKey(projectId), () => ((gen(projectId)?.fixedAssets ?? SEED_FA)));
  }
  async addFixedAsset(projectId: string, input: Omit<FixedAsset, 'id' | 'projectId'>): Promise<FixedAsset[]> {
    const all = readJson<FixedAsset[]>(faKey(projectId), () => ((gen(projectId)?.fixedAssets ?? SEED_FA)));
    all.push({ id: `fa-${projectId}-${Date.now()}`, projectId, ...input, category: sanitize(input.category), description: sanitize(input.description) });
    writeJson(faKey(projectId), all);
    return all;
  }
  async listMaintenance(projectId: string): Promise<MaintenanceRequest[]> {
    return readJson(maintKey(projectId), () => []);
  }
  async createMaintenance(projectId: string, input: { asset: string; description: string; estCost: number }): Promise<MaintenanceRequest> {
    const all = readJson<MaintenanceRequest[]>(maintKey(projectId), () => []);
    const req: MaintenanceRequest = {
      id: `mnt-${projectId}-${Date.now()}`, projectId, reqNo: `MNT-${String(all.length + 1).padStart(2, '0')}`,
      asset: sanitize(input.asset), description: sanitize(input.description), estCost: input.estCost, stageIndex: 0,
    };
    all.push(req);
    writeJson(maintKey(projectId), all);
    audit(projectId, 'create', 'Maintenance', req.reqNo, req.asset);
    return req;
  }
  async advanceMaintenance(projectId: string, reqNo: string, role: string): Promise<MaintenanceRequest> {
    const all = readJson<MaintenanceRequest[]>(maintKey(projectId), () => []);
    const req = all.find((r) => r.reqNo === reqNo);
    if (!req) throw new Error(`Maintenance ${reqNo} not found`);
    const stage = pendingMaintStage(req.stageIndex);
    const { stageIndex, error } = advanceMaint(req.stageIndex, role);
    if (error) throw new Error(error);
    req.stageIndex = stageIndex;
    writeJson(maintKey(projectId), all);
    audit(projectId, stage?.action ?? 'advance', 'Maintenance', req.reqNo, `${ROLE_LABEL[role] ?? role}${isMaintComplete(stageIndex) ? ' → paid' : ''}`);
    return req;
  }
}

// ---- localStorage helpers + seeds ----
const commentKey = (nodeId: string) => `nlc-ecc.comments.${nodeId}`;
const boqKey = (pid: string) => `nlc-ecc.boq.${pid}`;
const boqWfKey = (pid: string) => `nlc-ecc.boqwf.${pid}`;
const allocKey = (pid: string) => `nlc-ecc.alloc.${pid}`;
const contractKey = (pid: string) => `nlc-ecc.contracts.${pid}`;
const schedWfKey = (pid: string) => `nlc-ecc.schedwf.${pid}`;
const mapWfKey = (pid: string) => `nlc-ecc.mapwf.${pid}`;
const overheadKey = (pid: string) => `nlc-ecc.overheads.${pid}`;
const invKey = (pid: string) => `nlc-ecc.inventory.${pid}`;
const polKey = (pid: string) => `nlc-ecc.pol.${pid}`;
const faKey = (pid: string) => `nlc-ecc.fixedassets.${pid}`;
const maintKey = (pid: string) => `nlc-ecc.maintenance.${pid}`;
const hrKey = (nodeId: string) => `nlc-ecc.hr.${nodeId}`;
const hrUnitKey = (nodeId: string) => `nlc-ecc.hrunits.${nodeId}`;
const peopleKey = (nodeId: string) => `nlc-ecc.hrpeople.${nodeId}`;
const reqKey = (nodeId: string) => `nlc-ecc.hrreq.${nodeId}`;
const credKey = (nodeId: string) => `nlc-ecc.hrcreds.${nodeId}`;
const versionKey = (nodeId: string) => `nlc-ecc.hrversions.${nodeId}`;
const TRANSFERS_KEY = 'nlc-ecc.hrtransfers';
const REQ_STAGES: HrRequisition['stage'][] = ['raised', 'advertised', 'interview', 'offer', 'joined'];
const TRANSFER_ORDER: HrTransfer['stage'][] = ['raised', 'recommended', 'approved', 'effected'];
const progressKey = (pid: string) => `nlc-ecc.progress.${pid}`;
const SEED_HR: Record<string, HrPosting[]> = {
  'proj-f14f15': [
    { id: 'hr-f14-1', nodeId: 'proj-f14f15', category: 'Engineers', sanctioned: 12, posted: 10 },
    { id: 'hr-f14-2', nodeId: 'proj-f14f15', category: 'Surveyors', sanctioned: 6, posted: 5 },
    { id: 'hr-f14-3', nodeId: 'proj-f14f15', category: 'Operators', sanctioned: 18, posted: 15 },
    { id: 'hr-f14-4', nodeId: 'proj-f14f15', category: 'Admin const maintKey = (pid: string) => `nlc-ecc.maintenance.${pid}`; support', sanctioned: 8, posted: 8 },
  ],
  'pd-north': [{ id: 'hr-pdn-1', nodeId: 'pd-north', category: 'HQ staff', sanctioned: 14, posted: 12 }],
  'hq-engrs': [{ id: 'hr-eng-1', nodeId: 'hq-engrs', category: 'HQ Engineers staff', sanctioned: 20, posted: 18 }],
  'hq-nlc': [{ id: 'hr-nlc-1', nodeId: 'hq-nlc', category: 'HQ NLC secretariat', sanctioned: 30, posted: 27 }],
};

// ---- HR establishment / organogram seeds ----
type EstabDef = { id: string; parent: string | null; title: string; auth: number; held: number; scale?: string; cat?: string };
function estab(nodeId: string, defs: EstabDef[]): HrUnit[] {
  const order = new Map<string, number>();
  return defs.map((d) => {
    const key = d.parent ?? '__root';
    const o = order.get(key) ?? 0; order.set(key, o + 1);
    return { id: d.id, nodeId, parentId: d.parent, title: d.title, auth: d.auth, held: d.held, order: o, scale: d.scale, category: d.cat };
  });
}

const SEED_HR_UNITS: Record<string, HrUnit[]> = {
  // Image-1 style large project directorate (AUTH 113 / HELD 96 ≈ 85%).
  'proj-rwp-ring': estab('proj-rwp-ring', [
    { id: 'rr-dir', parent: null, title: 'Dir Proj (Centre)', scale: 'NLC-19', auth: 1, held: 1, cat: 'Command' },
    { id: 'rr-dy', parent: 'rr-dir', title: 'Dy Dir Proj (Centre)', scale: 'NLC-18', auth: 1, held: 1, cat: 'Command' },
    { id: 'rr-contract', parent: 'rr-dy', title: 'Contract Sec', auth: 7, held: 6, cat: 'Commercial' },
    { id: 'rr-contract-qs', parent: 'rr-contract', title: 'QS Cell', scale: 'NLC-16/17', auth: 4, held: 3, cat: 'Commercial' },
    { id: 'rr-contract-cc', parent: 'rr-contract', title: 'Contracts Cell', scale: 'NLC-14-16', auth: 3, held: 3, cat: 'Commercial' },
    { id: 'rr-billing', parent: 'rr-dy', title: 'Billing Sec', auth: 7, held: 6, cat: 'Commercial' },
    { id: 'rr-mfi', parent: 'rr-dy', title: 'M & FI Sec', auth: 7, held: 6, cat: 'Engineering' },
    { id: 'rr-plans', parent: 'rr-dy', title: 'Plans Sec', auth: 5, held: 4, cat: 'Planning' },
    { id: 'rr-hr', parent: 'rr-dy', title: 'HR Sec', auth: 7, held: 6, cat: 'Admin' },
    { id: 'rr-fa', parent: 'rr-dy', title: 'F&A Sec', auth: 12, held: 11, cat: 'Finance' },
    { id: 'rr-adm', parent: 'rr-dy', title: 'Adm / Coord Sec', auth: 46, held: 39, cat: 'Admin' },
    { id: 'rr-adm-office', parent: 'rr-adm', title: 'Office Admin', scale: 'NLC-11-15', auth: 20, held: 17, cat: 'Admin' },
    { id: 'rr-adm-coord', parent: 'rr-adm', title: 'Coordination', scale: 'NLC-14-16', auth: 14, held: 12, cat: 'Admin' },
    { id: 'rr-adm-support', parent: 'rr-adm', title: 'Support Staff', scale: 'NLC-1-7', auth: 12, held: 10, cat: 'Support' },
    { id: 'rr-md', parent: 'rr-dy', title: 'M&D Sec', auth: 7, held: 6, cat: 'Engineering' },
    { id: 'rr-pe', parent: 'rr-dy', title: 'P&E Sec', auth: 4, held: 3, cat: 'Plant' },
    { id: 'rr-rrs', parent: 'rr-dy', title: 'RR&S Sec', auth: 6, held: 5, cat: 'Engineering' },
    { id: 'rr-proc', parent: 'rr-dy', title: 'Proc Sec', auth: 3, held: 2, cat: 'Procurement' },
  ]),
  // PDF (Anx D) Table of Organisation — model establishment (Grand Total 33).
  'proj-e12': estab('proj-e12', [
    { id: 'e12-head', parent: null, title: 'Snr Mngr Proj / DPM', scale: 'NLC-19A/19B', auth: 1, held: 1, cat: 'Command' },
    { id: 'e12-cb', parent: 'e12-head', title: 'Contract / Billing Sec', auth: 3, held: 2, cat: 'Commercial' },
    { id: 'e12-cb-apm', parent: 'e12-cb', title: 'APM', scale: 'NLC-17', auth: 1, held: 1, cat: 'Commercial' },
    { id: 'e12-cb-qs', parent: 'e12-cb', title: 'SQS / QS', scale: 'NLC-17/16', auth: 1, held: 1, cat: 'Commercial' },
    { id: 'e12-cb-aqs', parent: 'e12-cb', title: 'AQS', scale: 'NLC-14-15', auth: 1, held: 0, cat: 'Commercial' },
    { id: 'e12-plan', parent: 'e12-head', title: 'Planning Sec', auth: 2, held: 2, cat: 'Planning' },
    { id: 'e12-plan-se', parent: 'e12-plan', title: 'Site Engr', scale: 'NLC-14-16', auth: 1, held: 1, cat: 'Engineering' },
    { id: 'e12-plan-erp', parent: 'e12-plan', title: 'ERP Coordinator', scale: 'NLC-14-16', auth: 1, held: 1, cat: 'Planning' },
    { id: 'e12-mfi', parent: 'e12-head', title: 'Monitoring & Field Insp Team', auth: 2, held: 2, cat: 'Engineering' },
    { id: 'e12-mfi-si', parent: 'e12-mfi', title: 'Site Incharge / Supvr', scale: 'NLC-14-16', auth: 2, held: 2, cat: 'Engineering' },
    { id: 'e12-svy', parent: 'e12-head', title: 'Svy Sec', auth: 2, held: 1, cat: 'Survey' },
    { id: 'e12-svy-snr', parent: 'e12-svy', title: 'Snr Svy / Svy', scale: 'NLC-16', auth: 1, held: 1, cat: 'Survey' },
    { id: 'e12-svy-asst', parent: 'e12-svy', title: 'Asst Svy', scale: 'NLC-12-13', auth: 1, held: 0, cat: 'Survey' },
    { id: 'e12-lab', parent: 'e12-head', title: 'Lab Sec', auth: 2, held: 2, cat: 'Lab' },
    { id: 'e12-lab-tech', parent: 'e12-lab', title: 'Snr Lab Tech / Lab Tech', scale: 'NLC-12-15', auth: 1, held: 1, cat: 'Lab' },
    { id: 'e12-lab-help', parent: 'e12-lab', title: 'Helper Lab', scale: 'NLC-5-7', auth: 1, held: 1, cat: 'Support' },
    { id: 'e12-cad', parent: 'e12-head', title: 'Design (Auto CAD) Sec', auth: 2, held: 2, cat: 'Engineering' },
    { id: 'e12-cad-op', parent: 'e12-cad', title: 'Snr / Auto CAD Op', scale: 'NLC-14-16', auth: 2, held: 2, cat: 'Engineering' },
    { id: 'e12-mt', parent: 'e12-head', title: 'MT / Plant & Eqpt Sec', auth: 5, held: 4, cat: 'Plant' },
    { id: 'e12-mt-supvr', parent: 'e12-mt', title: 'Supvr Adm / MT', scale: 'NLC-14-15', auth: 1, held: 1, cat: 'Plant' },
    { id: 'e12-mt-store', parent: 'e12-mt', title: 'Store Supvr / Keeper', scale: 'NLC-7-15', auth: 1, held: 1, cat: 'Plant' },
    { id: 'e12-mt-dvr', parent: 'e12-mt', title: 'Dvr LTV', scale: 'NLC-4-7', auth: 3, held: 2, cat: 'Support' },
    { id: 'e12-fa', parent: 'e12-head', title: 'F&A Sec', auth: 1, held: 1, cat: 'Finance' },
    { id: 'e12-fa-acct', parent: 'e12-fa', title: 'Snr Acct / Acct / Asst Acct', scale: 'NLC-14-16', auth: 1, held: 1, cat: 'Finance' },
    { id: 'e12-adm', parent: 'e12-head', title: 'Administration Group', auth: 7, held: 6, cat: 'Admin' },
    { id: 'e12-adm-supvr', parent: 'e12-adm', title: 'Snr Supvr Adm', scale: 'NLC-14-15', auth: 1, held: 1, cat: 'Admin' },
    { id: 'e12-adm-supdt', parent: 'e12-adm', title: 'Snr Supdt / Supdt Office', scale: 'NLC-14-16', auth: 1, held: 1, cat: 'Admin' },
    { id: 'e12-adm-udc', parent: 'e12-adm', title: 'UDC', scale: 'NLC-11-13', auth: 1, held: 1, cat: 'Admin' },
    { id: 'e12-adm-elec', parent: 'e12-adm', title: 'Electrician / Generator Op', scale: 'NLC-7-9', auth: 1, held: 1, cat: 'Support' },
    { id: 'e12-adm-cook', parent: 'e12-adm', title: 'Cook (Mess / Unit)', scale: 'NLC-5-7', auth: 1, held: 1, cat: 'Support' },
    { id: 'e12-adm-qasid', parent: 'e12-adm', title: 'N / Qasid', scale: 'NLC-1-3', auth: 1, held: 0, cat: 'Support' },
    { id: 'e12-adm-san', parent: 'e12-adm', title: 'Sanitary Worker', scale: 'NLC-1-2', auth: 1, held: 1, cat: 'Support' },
    { id: 'e12-sec', parent: 'e12-head', title: 'Security Sec', auth: 6, held: 5, cat: 'Security' },
    { id: 'e12-sec-guard', parent: 'e12-sec', title: 'Security Guard / Watchman', scale: 'NLC-1-7', auth: 6, held: 5, cat: 'Security' },
  ]),
  // PD HQ (Centre) directorate.
  'pd-centre': estab('pd-centre', [
    { id: 'pdc-pd', parent: null, title: 'Project Director (Centre)', scale: 'NLC-19/20', auth: 1, held: 1, cat: 'Command' },
    { id: 'pdc-coord', parent: 'pdc-pd', title: 'Coordination Sec', auth: 6, held: 5, cat: 'Admin' },
    { id: 'pdc-plan', parent: 'pdc-pd', title: 'Planning & Monitoring Sec', auth: 5, held: 4, cat: 'Planning' },
    { id: 'pdc-contract', parent: 'pdc-pd', title: 'Contracts Sec', auth: 5, held: 4, cat: 'Commercial' },
    { id: 'pdc-fa', parent: 'pdc-pd', title: 'F&A Sec', auth: 6, held: 5, cat: 'Finance' },
    { id: 'pdc-adm', parent: 'pdc-pd', title: 'Administration Sec', auth: 8, held: 7, cat: 'Admin' },
  ]),
  // HQ Engineers.
  'hq-engrs': estab('hq-engrs', [
    { id: 'eng-dg', parent: null, title: 'DG (Engineers)', scale: 'NLC-20/21', auth: 1, held: 1, cat: 'Command' },
    { id: 'eng-dir', parent: 'eng-dg', title: 'Dir (Works)', scale: 'NLC-19', auth: 1, held: 1, cat: 'Command' },
    { id: 'eng-tech', parent: 'eng-dir', title: 'Technical Sec', auth: 8, held: 7, cat: 'Engineering' },
    { id: 'eng-contract', parent: 'eng-dir', title: 'Contracts Sec', auth: 6, held: 5, cat: 'Commercial' },
    { id: 'eng-qa', parent: 'eng-dir', title: 'Quality Assurance Sec', auth: 5, held: 4, cat: 'Engineering' },
    { id: 'eng-adm', parent: 'eng-dir', title: 'Administration Sec', auth: 6, held: 5, cat: 'Admin' },
  ]),
};

type PersonDef = { id: string; unitId: string | null; name: string; rank?: string; status?: HrPerson['status']; cnic?: string; contact?: string; posted?: string; cat?: string };
function people(nodeId: string, defs: PersonDef[]): HrPerson[] {
  return defs.map((d) => ({
    id: d.id, nodeId, unitId: d.unitId, name: d.name, rank: d.rank,
    cnic: d.cnic, contact: d.contact, postingDate: d.posted,
    status: d.status ?? 'present', category: d.cat,
  }));
}

const SEED_PEOPLE: Record<string, HrPerson[]> = {
  'proj-rwp-ring': people('proj-rwp-ring', [
    { id: 'pr-dir', unitId: 'rr-dir', name: 'Col (R) Imran Yousaf', rank: 'NLC-19', status: 'present', cnic: '37405-1111111-1', contact: '0300-1111111', posted: '2024-02-01', cat: 'Command' },
    { id: 'pr-dy', unitId: 'rr-dy', name: 'Lt Col (R) Faisal Mehmood', rank: 'NLC-18', status: 'present', contact: '0300-2222222', posted: '2024-03-15', cat: 'Command' },
    { id: 'pr-hr1', unitId: 'rr-hr', name: 'Sadia Rauf', rank: 'NLC-16', status: 'present', posted: '2024-05-01', cat: 'Admin' },
    { id: 'pr-hr2', unitId: 'rr-hr', name: 'Usman Tariq', rank: 'NLC-14', status: 'leave', posted: '2024-06-10', cat: 'Admin' },
    { id: 'pr-qs1', unitId: 'rr-contract-qs', name: 'Hamza Sheikh', rank: 'NLC-17', status: 'present', posted: '2024-04-01', cat: 'Commercial' },
    { id: 'pr-qs2', unitId: 'rr-contract-qs', name: 'Ahsan Raza', rank: 'NLC-16', status: 'training', posted: '2024-09-01', cat: 'Commercial' },
    { id: 'pr-fa1', unitId: 'rr-fa', name: 'Nadia Iqbal', rank: 'NLC-16', status: 'present', posted: '2024-03-20', cat: 'Finance' },
    { id: 'pr-fa2', unitId: 'rr-fa', name: 'Kamran Aslam', rank: 'NLC-15', status: 'present', posted: '2024-07-05', cat: 'Finance' },
    { id: 'pr-proc', unitId: 'rr-proc', name: 'Bilal Hussain', rank: 'NLC-14', status: 'detached', posted: '2024-08-12', cat: 'Procurement' },
    { id: 'pr-bench', unitId: null, name: 'Zeeshan Ali', rank: 'NLC-14', status: 'present', posted: '2025-01-10', cat: 'Engineering' },
  ]),
};

const SEED_REQS: Record<string, HrRequisition[]> = {
  'proj-rwp-ring': [
    { id: 'req-rr-1', nodeId: 'proj-rwp-ring', unitId: 'rr-proc', title: 'Proc Sec', count: 1, stage: 'advertised', raisedAt: '2025-05-02T00:00:00.000Z', note: 'Procurement assistant' },
    { id: 'req-rr-2', nodeId: 'proj-rwp-ring', unitId: 'rr-adm-office', title: 'Office Admin', count: 3, stage: 'interview', raisedAt: '2025-04-18T00:00:00.000Z' },
    { id: 'req-rr-3', nodeId: 'proj-rwp-ring', unitId: 'rr-fa', title: 'F&A Sec', count: 1, stage: 'raised', raisedAt: '2025-05-20T00:00:00.000Z' },
  ],
};

const SEED_CREDS: Record<string, HrCredential[]> = {
  'proj-rwp-ring': [
    { id: 'cred-rr-1', nodeId: 'proj-rwp-ring', personId: 'pr-qs1', personName: 'Hamza Sheikh', kind: 'PEC', ref: 'CIVIL/12345', issued: '2019-03-01', expires: '2027-03-01' },
    { id: 'cred-rr-2', nodeId: 'proj-rwp-ring', personId: 'pr-dir', personName: 'Col (R) Imran Yousaf', kind: 'License', ref: 'LTV-PB-9981', issued: '2022-07-10', expires: '2026-07-31' },
    { id: 'cred-rr-3', nodeId: 'proj-rwp-ring', personId: 'pr-fa1', personName: 'Nadia Iqbal', kind: 'Certification', ref: 'ACCA-778120', issued: '2020-01-15' },
    { id: 'cred-rr-4', nodeId: 'proj-rwp-ring', personId: 'pr-proc', personName: 'Bilal Hussain', kind: 'Medical', ref: 'MED-2025-04', issued: '2025-04-01', expires: '2026-04-01' },
  ],
};

const SEED_TRANSFERS: HrTransfer[] = [
  {
    id: 'mov-seed-1', personId: 'pr-bench', personName: 'Zeeshan Ali',
    fromNodeId: 'proj-rwp-ring', fromNodeName: 'Rawalpindi Ring Road', fromUnitId: null,
    toNodeId: 'proj-rwp-ring', toNodeName: 'Rawalpindi Ring Road', toUnitId: 'rr-mfi', toUnitTitle: 'M & FI Sec',
    stage: 'recommended', reason: 'Bench to field inspection', raisedAt: '2025-05-25T00:00:00.000Z',
  },
];
const SEED_INVENTORY: InventoryItem[] = [
  { id: 'inv-proj-f14f15-1', projectId: 'proj-f14f15', kind: 'plant', ownership: 'integral', name: 'Excavator CAT 320', regNo: 'NLC-EX-12', status: 'operational', utilizationPct: 78 },
  { id: 'inv-proj-f14f15-2', projectId: 'proj-f14f15', kind: 'vehicle', ownership: 'hired', name: 'Dump truck (10m³)', regNo: 'LES-4471', status: 'operational', utilizationPct: 64 },
  { id: 'inv-proj-f14f15-3', projectId: 'proj-f14f15', kind: 'equipment', ownership: 'integral', name: 'Asphalt paver', regNo: 'NLC-AP-03', status: 'idle', utilizationPct: 22 },
];
const SEED_POL: PolRecord[] = [
  { id: 'pol-proj-f14f15-1', projectId: 'proj-f14f15', month: 'May-26', fuel: 'diesel', procured: 42000, issued: 38500, idealConsumption: 36000, actualConsumption: 38500 },
];
const SEED_FA: FixedAsset[] = [
  { id: 'fa-proj-f14f15-1', projectId: 'proj-f14f15', category: 'Site office', description: 'Prefab office complex', value: 18500000, acquired: '2025-09-20' },
  { id: 'fa-proj-f14f15-2', projectId: 'proj-f14f15', category: 'Survey', description: 'Total station (Leica)', value: 3200000, acquired: '2025-10-05' },
];
const SEED_OVERHEADS: OverheadLine[] = [
  { id: 'ovh-proj-f14f15-1', projectId: 'proj-f14f15', category: 'Salaries (site staff)', month: 'May-26', plannedCost: 8500000 },
  { id: 'ovh-proj-f14f15-2', projectId: 'proj-f14f15', category: 'Light-vehicle POL', month: 'May-26', plannedCost: 1200000 },
  { id: 'ovh-proj-f14f15-3', projectId: 'proj-f14f15', category: 'Camp utilities', month: 'May-26', plannedCost: 900000 },
];
const ipcKey = (pid: string) => `nlc-ecc.ipcs.${pid}`;
const subKey = (pid: string) => `nlc-ecc.subs.${pid}`;
const rarKey = (pid: string) => `nlc-ecc.rars.${pid}`;
const linkKey = (pid: string) => `nlc-ecc.rarlinks.${pid}`;
const epcKey = (pid: string) => `nlc-ecc.epcs.${pid}`;
const escIdxKey = (pid: string) => `nlc-ecc.escindices.${pid}`;
const voKey = (pid: string) => `nlc-ecc.variations.${pid}`;
const contractsRegKey = (pid: string) => `nlc-ecc.contractsreg.${pid}`;
const commCfgKey = (pid: string) => `nlc-ecc.commcfg.${pid}`;
const clampPct = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
const advKey = (pid: string) => `nlc-ecc.advances.${pid}`;
const bgKey = (pid: string) => `nlc-ecc.bankguarantees.${pid}`;
const distKey = (pid: string) => `nlc-ecc.dists.${pid}`;
const schedKey = (pid: string) => `nlc-ecc.sched.${pid}`;
const seriesKey = (pid: string) => `nlc-ecc.series.${pid}`;
const nodesKey = 'nlc-ecc.nodes';
const projectsKey = 'nlc-ecc.projects';
const seedVersionKey = 'nlc-ecc.seedVersion';
// Bump when the bundled project roster / seed changes so existing cached stores
// pick up newly-seeded projects and nodes without losing user-created data.
const SEED_VERSION = '2026-07-04.v9-lifecycle-stages';

/** Merge any newly-seeded projects/nodes into an already-persisted store and
 *  backfill date/coordinate fields on seeded projects. Runs once per version. */
function reconcileSeed(): void {
  try {
    if (readJson<string | null>(seedVersionKey, () => null) === SEED_VERSION) return;

    const exP = readJson<Project[]>(projectsKey, () => []);
    if (exP.length === 0) {
      writeJson(projectsKey, PROJECTS);
    } else {
      const seededById = new Map(PROJECTS.map((p) => [p.id, p] as const));
      const ids = new Set(exP.map((p) => p.id));
      let changed = false;
      // backfill new fields on existing seeded projects
      for (const p of exP) {
        const s = seededById.get(p.id);
        if (!s) continue;
        if (p.commencementDate == null && s.commencementDate) { p.commencementDate = s.commencementDate; changed = true; }
        if (p.completionDate == null && s.completionDate) { p.completionDate = s.completionDate; changed = true; }
        if (p.lat == null && s.lat != null) { p.lat = s.lat; p.lng = s.lng; p.location = p.location ?? s.location; changed = true; }
        // lifecycle stages (v9): adopt the seeded stage + completed-project figures once
        if (p.stage == null && s.stage) {
          p.stage = s.stage; p.tocDate = s.tocDate; p.financialCloseDate = s.financialCloseDate;
          p.plannedPct = s.plannedPct; p.actualPct = s.actualPct;
          p.billedToDate = s.billedToDate; p.receivedToDate = s.receivedToDate;
          changed = true;
        }
      }
      // append projects that aren't present yet
      for (const p of PROJECTS) if (!ids.has(p.id)) { exP.push(p); changed = true; }
      if (changed) writeJson(projectsKey, exP);
    }

    const exN = readJson<OrgNode[]>(nodesKey, () => []);
    if (exN.length === 0) {
      writeJson(nodesKey, NODES);
    } else {
      const nids = new Set(exN.map((n) => n.id));
      let nchanged = false;
      for (const n of NODES) if (!nids.has(n.id)) { exN.push(n); nchanged = true; }
      if (nchanged) writeJson(nodesKey, exN);
    }

    // Flagship is now generated like every other project — drop any stale hand-seeded
    // caches so its whole commercial spine regenerates consistently.
    try {
      const F = 'proj-f14f15';
      for (const k of [
        'boq', 'progress', 'ipcs', 'subs', 'rars', 'rarlinks', 'variations', 'contractsreg',
        'bankguarantees', 'dists', 'sched', 'escindices', 'epcs', 'resources', 'overheads',
        'receipts', 'payments', 'liabilities', 'suppliers', 'demands', 'salients',
        'production', 'materialIssues', 'inventory', 'pol', 'fixedassets', 'advances', 'boqmat', 'machinery',
      ]) store.removeItem(`nlc-ecc.${k}.${F}`);
    } catch { /* ignore */ }

    writeJson(seedVersionKey, SEED_VERSION);
  } catch { /* ignore */ }
}
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
const billKey = (pid: string) => `nlc-ecc.supplierbills.${pid}`;
const ppayKey = (pid: string) => `nlc-ecc.ppays.${pid}`;
const hireKey = (pid: string) => `nlc-ecc.hires.${pid}`;
const prodKey = (pid: string) => `nlc-ecc.production.${pid}`;
const issueKey = (pid: string) => `nlc-ecc.materialIssues.${pid}`;
const machineryKey = (pid: string) => `nlc-ecc.machinery.${pid}`;
const alertStateKey = (pid: string) => `nlc-ecc.alertstates.${pid}`;
const USERS_KEY = 'nlc-ecc.users';
const DIRECTIVES_KEY = 'nlc-ecc.directives';
const MARKINPUTS_KEY = 'nlc-ecc.markinputs';
const hrPropKey = (pid: string) => `nlc-ecc.hrproposals.${pid}`;
const matMasterKey = (pid: string) => `nlc-ecc.matmaster.${pid}`;
const dlpKey = (pid: string) => `nlc-ecc.dlpdefects.${pid}`;
const mixKey = (pid: string) => `nlc-ecc.mixdesigns.${pid}`;
/** Seeded DLP registers for the physically-completed demo projects. */
const DLP_SEED: Record<string, DlpDefect[]> = {
  'proj-attock-byp': [
    { id: 'dlp-proj-attock-byp-1', projectId: 'proj-attock-byp', raised: '2026-05-02', description: 'Shoulder erosion at RD 4+300 after first rains', location: 'RD 4+300 LHS', severity: 'major', status: 'open' },
    { id: 'dlp-proj-attock-byp-2', projectId: 'proj-attock-byp', raised: '2026-04-11', description: 'Guard-rail reflectors missing on curve', location: 'RD 2+850', severity: 'minor', status: 'rectified', rectifiedDate: '2026-04-25' },
  ],
  'proj-thar-coal-rd': [],
};
const APPT_SCOPE: Record<string, string> = { project: 'proj-f14f15', pd_hq: 'pd-north', hq_engrs: 'hq-engrs', hq_nlc: 'hq-nlc' };
/** Individual logins for EVERY appointment (spec §9 A1); demo scopes: project staff on the
 * flagship, PD staff on PD North. Legacy named users retained for existing flows. */
const SEED_USERS: AppUser[] = [
  { id: 'u-admin', name: 'System Admin', role: 'admin', nodeId: 'hq-nlc' },
  { id: 'u-pd-north', name: 'Project Director — North', role: 'pd', nodeId: 'pd-north', appointmentId: 'pd' },
  { id: 'u-pm-f14', name: 'PM — F-14/F-15', role: 'pm', nodeId: 'proj-f14f15', appointmentId: 'spm' },
  ...APPOINTMENTS.filter((a) => !['pd', 'spm'].includes(a.id)).map((a) => ({
    id: `u-${a.id}`,
    name: a.title,
    role: legacyRoleFor(a.id),
    nodeId: APPT_SCOPE[a.level],
    appointmentId: a.id,
  })),
];
const salientKey = (pid: string) => `nlc-ecc.salients.${pid}`;
const photoKey = (pid: string) => `nlc-ecc.photos.${pid}`;
const attachKey = (pid: string) => `nlc-ecc.attach.${pid}`;
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
  { id: 'mi-proj-f14f15-1', projectId: 'proj-f14f15', dated: '2026-05-14', materialCode: 'M-CEM', qty: 8000, issuedTo: 'Structures (culverts)', contractorId: 'sub-proj-f14f15-1', rate: 1150, recovered: 4000000 },
  { id: 'mi-proj-f14f15-2', projectId: 'proj-f14f15', dated: '2026-05-30', materialCode: 'M-CEM', qty: 6500, issuedTo: 'Box culvert RD 12+000', contractorId: 'sub-proj-f14f15-2', rate: 1150, recovered: 0 },
];

// ---- Pluggable key-value store (localStorage by default; remote in api mode) ----
export interface KvStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memStore = new Map<string, string>();
const fallbackStore: KvStore = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k)! : null),
  setItem: (k, v) => void memStore.set(k, v),
  removeItem: (k) => void memStore.delete(k),
};

let store: KvStore = typeof localStorage !== 'undefined' ? localStorage : fallbackStore;

/** Swap the backing store (used by api mode to point at the remote KV). */
export function setKvStore(s: KvStore): void { store = s; }

function writeJson(key: string, value: unknown): void {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

// ---- Audit (append-only) ----
const AUDIT_KEY = 'nlc-ecc.audit';
function readAudit(): AuditEntry[] {
  try {
    const raw = store.getItem(AUDIT_KEY);
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
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('nlc:audit'));
}

/** Read JSON from localStorage, seeding (and persisting) a default if absent. */
function readJson<T>(key: string, seed: () => T): T {
  try {
    const raw = store.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    /* ignore */
  }
  const seeded = seed();
  writeJson(key, seeded);
  return JSON.parse(JSON.stringify(seeded)) as T;
}

const SEED_CONTRACTS: Contract[] = [
  { id: 'ctr-proj-f14f15-1', projectId: 'proj-f14f15', contractNo: 'NLC/F14F15/SC-01', title: 'Earthworks & structures package', subcontractorId: 'sub-proj-f14f15-1', scopeBills: ['1', '2'], value: 2_100_000_000, awardDate: '2025-03-01', status: 'in_progress' },
  { id: 'ctr-proj-f14f15-2', projectId: 'proj-f14f15', contractNo: 'NLC/F14F15/SC-02', title: 'Wet utilities package (WS/Sewer/SWD)', subcontractorId: 'sub-proj-f14f15-2', scopeBills: ['4', '5', '6'], value: 2_450_000_000, awardDate: '2025-04-15', status: 'in_progress' },
  { id: 'ctr-proj-f14f15-3', projectId: 'proj-f14f15', contractNo: 'NLC/F14F15/SC-03', title: 'Bituminous & paving package', subcontractorId: 'sub-proj-f14f15-3', scopeBills: ['1'], value: 1_650_000_000, awardDate: '2025-06-01', status: 'awarded' },
];

const SEED_VARIATIONS: Variation[] = [
  { id: 'vo-proj-f14f15-1', projectId: 'proj-f14f15', voNo: 'VO-01', seq: 1, title: 'Additional culvert at km 4+200', type: 'addition', amount: 185000000, status: 'approved', date: '2026-03-12' },
  { id: 'vo-proj-f14f15-2', projectId: 'proj-f14f15', voNo: 'VO-02', seq: 2, title: 'Omission of secondary drain', type: 'omission', amount: -42000000, status: 'recommended', date: '2026-04-20' },
  { id: 'vo-proj-f14f15-3', projectId: 'proj-f14f15', voNo: 'VO-03', seq: 3, title: 'Rate revision — bitumen escalation', type: 'rate_change', amount: 96000000, status: 'submitted', date: '2026-05-08' },
];

const SEED_BGS: BankGuarantee[] = [
  { id: 'bg-f14-mob-1', projectId: 'proj-f14f15', kind: 'mob', party: 'client', bgNo: 'BG/MOB/2026/014', bank: 'National Bank of Pakistan', amount: 2100000000, issued: '2026-01-10', expires: '2026-12-31', status: 'active' },
  { id: 'bg-f14-sec-1', projectId: 'proj-f14f15', kind: 'secure', party: 'sub', subcontractorId: 'sub-proj-f14f15-1', bgNo: 'BG/SEC/2026/041', bank: 'Habib Bank Ltd', amount: 350000000, issued: '2026-02-01', expires: '2026-08-15', status: 'active' },
];

const SEED_DISTRIBUTIONS: Distribution[] = [
  { boqItemId: 'boq-proj-f14f15-0', projectId: 'proj-f14f15', mode: 'self', allocatedQty: 45000 },
  { boqItemId: 'boq-proj-f14f15-1', projectId: 'proj-f14f15', mode: 'sublet', subcontractorId: 'sub-proj-f14f15-1', allocatedQty: 120000 },
  { boqItemId: 'boq-proj-f14f15-3', projectId: 'proj-f14f15', mode: 'sublet', subcontractorId: 'sub-proj-f14f15-2', allocatedQty: 38000 },
  { boqItemId: 'boq-proj-f14f15-4', projectId: 'proj-f14f15', mode: 'self', allocatedQty: 21000 },
];

const SEED_SUBS: Subcontractor[] = [
  { id: 'sub-proj-f14f15-1', projectId: 'proj-f14f15', name: 'Frontier Works Org (FWO)', trade: 'Earthworks', kind: 'sublet', owner: 'FWO', cnic: '—', pecCategory: 'C-A', enlistment: 'NLC/EN/001', address: 'Rawalpindi', contact: '051-000000', performanceSecurity: 50_000_000 },
  { id: 'sub-proj-f14f15-2', projectId: 'proj-f14f15', name: 'Sardar & Sons', trade: 'Bituminous works', kind: 'sublet', owner: 'A. Sardar', cnic: '37405-0000000-0', pecCategory: 'C-3', enlistment: 'NLC/EN/014', address: 'Islamabad', contact: '051-111111', performanceSecurity: 12_000_000 },
  { id: 'sub-proj-f14f15-3', projectId: 'proj-f14f15', name: 'Reliable Construction', trade: 'RCC structures', kind: 'labor', owner: 'M. Reliable', cnic: '61101-0000000-0', pecCategory: 'C-5', enlistment: 'NLC/EN/031', address: 'Taxila', contact: '051-222222', performanceSecurity: 5_000_000 },
];

const SEED_RARS: Rar[] = [
  { id: 'rar-proj-f14f15-1', projectId: 'proj-f14f15', rarNo: 'RAR-01', seq: 1, period: 'Feb-2026', status: 'paid', subcontractorId: 'sub-proj-f14f15-1', contractId: 'ctr-proj-f14f15-1', gross: 1800000000, netPayable: computeNet(1800000000), lines: [{ boqItemId: 'boq-proj-f14f15-1', qty: 60000, rate: 420, amount: 25200000 }] },
  { id: 'rar-proj-f14f15-2', projectId: 'proj-f14f15', rarNo: 'RAR-02', seq: 2, period: 'Apr-2026', status: 'approved', subcontractorId: 'sub-proj-f14f15-2', contractId: 'ctr-proj-f14f15-2', gross: 2100000000, netPayable: computeNet(2100000000), lines: [{ boqItemId: 'boq-proj-f14f15-3', qty: 19000, rate: 5400, amount: 102600000 }] },
  { id: 'rar-proj-f14f15-3', projectId: 'proj-f14f15', rarNo: 'RAR-03', seq: 3, period: 'May-2026', status: 'submitted', subcontractorId: 'sub-proj-f14f15-3', contractId: 'ctr-proj-f14f15-3', gross: 1450000000, netPayable: computeNet(1450000000), lines: [{ boqItemId: 'boq-proj-f14f15-4', qty: 6383, rate: 23500, amount: 150000500 }] },
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
    const raw = store.getItem(boqKey(projectId));
    if (raw) return JSON.parse(raw) as BoqItem[];
  } catch {
    /* ignore */
  }
  // Flagship is generated like every other project so BOQ ↔ executed ↔ vetted ↔ billed reconcile.
  const g = gen(projectId);
  if (g) { writeJson(boqKey(projectId), g.boq); return g.boq; }
  return [];
}

function readIpcs(projectId: string): Ipc[] {
  try {
    const raw = store.getItem(ipcKey(projectId));
    if (raw) return JSON.parse(raw) as Ipc[];
  } catch {
    /* ignore */
  }
  // Flagship is generated like every other project so its IPC lines total the gross.
  const g = gen(projectId);
  if (g) { writeJson(ipcKey(projectId), g.ipcs); return JSON.parse(JSON.stringify(g.ipcs)) as Ipc[]; }
  return [];
}



function readComments(nodeId: string): NodeComment[] {
  try {
    const raw = store.getItem(commentKey(nodeId));
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
