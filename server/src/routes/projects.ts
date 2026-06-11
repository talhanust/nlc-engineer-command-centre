import { Router, Response, NextFunction } from 'express';
import { AuthedRequest, ApiError } from '../types';
import { requireUser } from '../auth';
import { requireProjectAccess } from '../authz';
import { query } from '../db';

export const projectsRouter = Router();

interface ProjectRow {
  id: string;
  pd_hq_id: string;
  full_name: string | null;
  archived: boolean;
  client_name: string | null;
  design_consultant: string | null;
  contract_ref: string | null;
  contract_value: string;
  window_start: string | null;
  window_end: string | null;
}

// GET /api/projects — access-scoped list (the project_access axis, enforced).
projectsRouter.get('/projects', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const roleKeys = user.roles.map((r) => r.role);
    // admin sees all; others see only projects their roles can access.
    const rows = await query<ProjectRow>(
      user.is_admin
        ? `SELECT p.id, p.pd_hq_id, p.full_name, p.archived, p.client_name,
                  p.design_consultant, p.contract_ref, p.contract_value::text AS contract_value,
                  p.window_start::text, p.window_end::text
             FROM fnpc.project p
            WHERE p.archived = FALSE
            ORDER BY p.id`
        : `SELECT DISTINCT p.id, p.pd_hq_id, p.full_name, p.archived, p.client_name,
                  p.design_consultant, p.contract_ref, p.contract_value::text AS contract_value,
                  p.window_start::text, p.window_end::text
             FROM fnpc.project p
             JOIN fnpc.project_access pa ON pa.project_id = p.id
            WHERE p.archived = FALSE AND pa.role_key = ANY($1::text[])
            ORDER BY p.id`,
      user.is_admin ? [] : [roleKeys],
    );
    res.json({ items: rows, next_cursor: null });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id — one project + salients.
projectsRouter.get(
  '/projects/:id',
  requireProjectAccess('id'),
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const rows = await query<ProjectRow>(
        `SELECT id, pd_hq_id, full_name, archived, client_name, design_consultant,
                contract_ref, contract_value::text AS contract_value,
                window_start::text, window_end::text
           FROM fnpc.project WHERE id = $1`,
        [req.params.id],
      );
      if (rows.length === 0) throw new ApiError(404, 'NOT_FOUND', 'project not found');
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/projects/:id/state — server-assembled full state document (M2).
// The handler assembles the slice shape the single-file app expects from the
// normalized tables. Shown here for IPCs + salients; extend per slice.
projectsRouter.get(
  '/projects/:id/state',
  requireProjectAccess('id'),
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      const proj = await query<ProjectRow & { version: number }>(
        `SELECT id, pd_hq_id, full_name, archived, client_name, design_consultant,
                contract_ref, contract_value::text AS contract_value,
                window_start::text, window_end::text,
                (extract(epoch from updated_at)::bigint) AS version
           FROM fnpc.project WHERE id = $1`,
        [id],
      );
      if (proj.length === 0) throw new ApiError(404, 'NOT_FOUND', 'project not found');

      const ipcs = await query<Record<string, unknown>>(
        `SELECT ipc_no, status, gross::text, net_payable::text, cum_gross::text, period
           FROM fnpc.ipc WHERE project_id = $1 ORDER BY seq`,
        [id],
      );

      res.json({
        version: proj[0].version,
        project: proj[0],
        commercial: { ipcs },
        // financial / execution / mapping / procurement assembled the same way.
      });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/projects/:id/state — whole-document save, optimistic-locked.
projectsRouter.put(
  '/projects/:id/state',
  requireProjectAccess('id'),
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      const sentVersion = Number(req.body?.version);
      const cur = await query<{ version: number }>(
        `SELECT (extract(epoch from updated_at)::bigint) AS version
           FROM fnpc.project WHERE id = $1`,
        [id],
      );
      if (cur.length === 0) throw new ApiError(404, 'NOT_FOUND', 'project not found');
      if (Number.isFinite(sentVersion) && sentVersion !== cur[0].version) {
        throw new ApiError(409, 'CONFLICT', 'stale version — reload and retry', {
          your_version: sentVersion,
          current_version: cur[0].version,
        });
      }
      // Real impl: diff req.body slices into normalized rows inside a
      // transaction, writing audit per change. Stamping updated_at bumps the
      // version that the next read observes.
      await query(`UPDATE fnpc.project SET updated_at = now() WHERE id = $1`, [id]);
      const next = await query<{ version: number }>(
        `SELECT (extract(epoch from updated_at)::bigint) AS version
           FROM fnpc.project WHERE id = $1`,
        [id],
      );
      res.json({ ok: true, version: next[0].version });
    } catch (err) {
      next(err);
    }
  },
);
