import { query } from './db';
import { AppUser } from './types';

/**
 * Write one immutable audit row. Called by every mutating handler. The
 * client cannot suppress or forge this — the audit_log table also has a
 * database trigger forbidding UPDATE/DELETE, so the trail is tamper-evident.
 */
export async function writeAudit(opts: {
  actor: AppUser;
  module: string;
  action: string;
  refType?: string;
  refId?: string;
  projectId?: string;
  before?: unknown;
  after?: unknown;
  notes?: string;
}): Promise<void> {
  // Use the caller's first role for the role_key column (display/grouping only).
  const roleKey = opts.actor.roles[0]?.role ?? (opts.actor.is_admin ? 'admin' : null);
  await query(
    `INSERT INTO fnpc.audit_log
       (actor_id, role_key, module, action, ref_type, ref_id, project_id, before, after, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      opts.actor.id,
      roleKey,
      opts.module,
      opts.action,
      opts.refType ?? null,
      opts.refId ?? null,
      opts.projectId ?? null,
      opts.before === undefined ? null : JSON.stringify(opts.before),
      opts.after === undefined ? null : JSON.stringify(opts.after),
      opts.notes ?? null,
    ],
  );
}
