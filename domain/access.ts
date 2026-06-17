import { ROLE_LABEL } from './chains';

export const CAPABILITIES = [
  'create_ipc', 'approve_ipc', 'reverse_txn', 'create_demand',
  'approve_payment', 'manage_subcontractors', 'edit_settings',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABEL: Record<Capability, string> = {
  create_ipc: 'Create IPC',
  approve_ipc: 'Approve IPC',
  reverse_txn: 'Reverse transaction',
  create_demand: 'Create demand',
  approve_payment: 'Approve payment',
  manage_subcontractors: 'Manage subcontractors',
  edit_settings: 'Edit settings',
};

export const MATRIX_ROLES = ['pm', 'pd', 'comd_engrs', 'dir_sp', 'dg'] as const;
export type MatrixRole = (typeof MATRIX_ROLES)[number];

export type AccessMatrix = Record<string, Capability[]>;

export const DEFAULT_ACCESS_MATRIX: AccessMatrix = {
  pm: ['create_ipc', 'create_demand', 'manage_subcontractors'],
  pd: ['create_ipc', 'approve_ipc', 'create_demand', 'approve_payment', 'manage_subcontractors'],
  comd_engrs: ['approve_ipc', 'approve_payment', 'reverse_txn'],
  dir_sp: ['approve_ipc', 'approve_payment', 'reverse_txn'],
  dg: ['approve_ipc', 'approve_payment', 'reverse_txn', 'edit_settings'],
};

const KEY = 'nlc-ecc.accessMatrix';
let cache: AccessMatrix | null = null;

export function getAccessMatrix(): AccessMatrix {
  if (cache) return cache;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    cache = raw ? (JSON.parse(raw) as AccessMatrix) : structuredClone(DEFAULT_ACCESS_MATRIX);
  } catch {
    cache = structuredClone(DEFAULT_ACCESS_MATRIX);
  }
  return cache;
}

export function setAccessMatrix(next: AccessMatrix): void {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function can(role: string, cap: Capability, matrix: AccessMatrix = getAccessMatrix()): boolean {
  return (matrix[role] ?? []).includes(cap);
}

export { ROLE_LABEL };
