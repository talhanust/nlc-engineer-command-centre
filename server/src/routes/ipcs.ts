import { Router, Response, NextFunction } from 'express';
import { AuthedRequest, ApiError } from '../types';
import { requireUser } from '../auth';
import { requirePermission, requireProjectAccess } from '../authz';
import { query, withTransaction } from '../db';
import { writeAudit } from '../audit';

export const ipcsRouter = Router();

/**
 * The IPC pipeline as an explicit state machine. A transition names an
 * `action`; the server validates the edge, checks the permission gate for
 * that action, and stamps the corresponding timestamp. Illegal edges are
 * 409; out-of-permission actions are 403. Mirrors the prototype's pipeline.
 */
const IPC_TRANSITIONS: Record<string, { from: string; to: string; stamp: string; perm: string }> = {
  submit: { from: 'draft', to: 'submitted', stamp: 'submitted_at', perm: 'ipc.submit' },
  vet: { from: 'submitted', to: 'vetted', stamp: 'vetted_at', perm: 'ipc.vet' },
  forward: { from: 'vetted', to: 'forwarded_to_client', stamp: 'forwarded_to_client_at', perm: 'ipc.forward' },
  approve: { from: 'forwarded_to_client', to: 'approved', stamp: 'client_approved_at', perm: 'ipc.approve' },
  ack: { from: 'approved', to: 'paid_pending_ack', stamp: 'receipt_ack_at', perm: 'ipc.ack' },
  pay: { from: 'paid_pending_ack', to: 'paid', stamp: 'paid_at', perm: 'ipc.pay' },
};

interface IpcRow {
  id: number;
  project_id: string;
  ipc_no: string;
  status: string;
  gross: string;
}

// GET /api/projects/:id/ipcs — the IPC register (read; project-scoped).
ipcsRouter.get(
  '/projects/:id/ipcs',
  requireProjectAccess('id'),
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const rows = await query<IpcRow>(
        `SELECT id, project_id, ipc_no, status, gross::text AS gross
           FROM fnpc.ipc WHERE project_id = $1 ORDER BY seq`,
        [req.params.id],
      );
      res.json({ items: rows, next_cursor: null });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/ipcs/:ipcId/transitions — advance the pipeline.
// Note: project-access for this route would be resolved from the IPC's
// project_id inside the handler (shown), since the project id isn't in the path.
ipcsRouter.post(
  '/ipcs/:ipcId/transitions',
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const action = String(req.body?.action ?? '');
      const t = IPC_TRANSITIONS[action];
      if (!t) throw new ApiError(400, 'VALIDATION', `unknown IPC action '${action}'`);

      await withTransaction(async (q) => {
        const rows = (await q(`SELECT id, project_id, ipc_no, status FROM fnpc.ipc WHERE id = $1`, [
          req.params.ipcId,
        ])) as Array<{ id: number; project_id: string; ipc_no: string; status: string }>;
        if (rows.length === 0) throw new ApiError(404, 'NOT_FOUND', 'IPC not found');
        const ipc = rows[0];

        // Axis 2: project access (resolved from the IPC's project).
        if (!user.is_admin) {
          const roleKeys = user.roles.map((r) => r.role);
          const acc = (await q(
            `SELECT 1 FROM fnpc.project_access WHERE project_id = $1 AND role_key = ANY($2::text[]) LIMIT 1`,
            [ipc.project_id, roleKeys],
          )) as unknown[];
          if (acc.length === 0) {
            throw new ApiError(403, 'FORBIDDEN', `no access to project '${ipc.project_id}'`);
          }
          // Axis 1: action × role.
          const perm = (await q(
            `SELECT 1 FROM fnpc.role_permission WHERE permission_key = $1 AND role_key = ANY($2::text[]) LIMIT 1`,
            [t.perm, roleKeys],
          )) as unknown[];
          if (perm.length === 0) {
            throw new ApiError(403, 'FORBIDDEN', `role(s) may not perform '${t.perm}'`);
          }
        }

        // Edge validation.
        if (ipc.status !== t.from) {
          throw new ApiError(409, 'CONFLICT', `IPC is '${ipc.status}', cannot ${action}`, {
            expected_from: t.from,
          });
        }

        await q(
          `UPDATE fnpc.ipc SET status = $1, ${t.stamp} = now() WHERE id = $2`,
          [t.to, ipc.id],
        );
        await writeAudit({
          actor: user,
          module: 'commercial',
          action: `ipc.${action}`,
          refType: 'ipc',
          refId: ipc.ipc_no,
          projectId: ipc.project_id,
          before: { status: ipc.status },
          after: { status: t.to },
        });
        res.json({ ok: true, ipc_no: ipc.ipc_no, status: t.to });
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/projects/:id/ipcs — create a draft IPC (server-authoritative money).
ipcsRouter.post(
  '/projects/:id/ipcs',
  requirePermission('ipc.create'),
  requireProjectAccess('id'),
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      const id = req.params.id;
      // Real impl: compute line amounts via boq_item.unit_divisor, sum gross,
      // derive deductions from commercial_settings — never trust client money.
      const period = String(req.body?.period ?? 'Period not specified');
      const out = await withTransaction(async (q) => {
        const seqRows = (await q(
          `SELECT COALESCE(MAX(seq),0)+1 AS seq FROM fnpc.ipc WHERE project_id = $1`,
          [id],
        )) as Array<{ seq: number }>;
        const seq = seqRows[0].seq;
        const ipcNo = 'IPC-' + String(seq).padStart(2, '0');
        await q(
          `INSERT INTO fnpc.ipc (project_id, ipc_no, seq, period, status, gross, net_payable, cum_gross, drafted_at)
           VALUES ($1,$2,$3,$4,'draft',0,0,0,now())`,
          [id, ipcNo, seq, period],
        );
        await writeAudit({
          actor: user,
          module: 'commercial',
          action: 'ipc.create',
          refType: 'ipc',
          refId: ipcNo,
          projectId: id,
          after: { ipc_no: ipcNo, status: 'draft' },
        });
        return ipcNo;
      });
      res.status(201).json({ ok: true, ipc_no: out, status: 'draft' });
    } catch (err) {
      next(err);
    }
  },
);
