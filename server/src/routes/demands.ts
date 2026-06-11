import { Router, Response, NextFunction } from 'express';
import { AuthedRequest, ApiError } from '../types';
import { requireUser } from '../auth';
import { resolveNextStage, callerHoldsStageRole, assertFinancialPower } from '../authz';
import { withTransaction } from '../db';
import { writeAudit } from '../audit';

export const demandsRouter = Router();

/**
 * POST /api/demands/:demandId/advance — the chain-walking primitive.
 *
 * It does NOT hardcode the next action. It reads the demand's chain_type,
 * resolves the next stage (project override → global default, admin always
 * retained), checks the caller holds a permitted role for that stage, checks
 * the caller's financial power covers the demand value, records the event,
 * advances current_stage, and audits. Uniform across all six chains — their
 * mid-chain divergence is data in approval_chain_stage, not branching code.
 */
demandsRouter.post(
  '/demands/:demandId/advance',
  async (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      const user = requireUser(req);
      await withTransaction(async (q) => {
        const rows = (await q(
          `SELECT id, project_id, demand_no, type, chain_type, current_stage, total_estimated::text AS total_estimated
             FROM fnpc.demand WHERE id = $1`,
          [req.params.demandId],
        )) as Array<{
          id: number;
          project_id: string;
          demand_no: string;
          chain_type: string;
          current_stage: number;
          total_estimated: string;
        }>;
        if (rows.length === 0) throw new ApiError(404, 'NOT_FOUND', 'demand not found');
        const d = rows[0];

        const nextIndex = d.current_stage + 1;
        const stage = await resolveNextStage(d.project_id, d.chain_type, nextIndex);

        if (!callerHoldsStageRole(user, stage)) {
          throw new ApiError(403, 'FORBIDDEN', `stage '${stage.stage_name}' requires one of: ${stage.roles.join(', ')}`);
        }
        // Financial power is checked against the stage's primary (default) role.
        await assertFinancialPower(user, stage.roles[0], d.total_estimated);

        await q(`UPDATE fnpc.demand SET current_stage = $1 WHERE id = $2`, [nextIndex, d.id]);
        await q(
          `INSERT INTO fnpc.approval_event (doc_type, doc_id, stage_index, action, actor_id, note)
           VALUES ('demand', $1, $2, $3, $4, $5)`,
          [d.id, stage.stage_index, stage.action, user.id, req.body?.note ?? null],
        );
        await writeAudit({
          actor: user,
          module: 'procurement',
          action: `demand.${stage.action}`,
          refType: 'demand',
          refId: d.demand_no,
          projectId: d.project_id,
          before: { stage: d.current_stage },
          after: { stage: nextIndex },
        });
        res.json({ ok: true, demand_no: d.demand_no, stage: nextIndex, stage_name: stage.stage_name });
      });
    } catch (err) {
      next(err);
    }
  },
);
