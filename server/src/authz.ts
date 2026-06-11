import { Response, NextFunction } from 'express';
import { query } from './db';
import { AppUser, AuthedRequest, ApiError } from './types';
import { requireUser } from './auth';

/**
 * The authorization layer. This is where the prototype's client-side
 * canDo / requireRole / canAccessProject / financial-power checks become
 * the REAL gate. An action is permitted only when every applicable axis
 * passes. `admin` bypasses the project-access and financial-power axes.
 *
 * Axis 1 — action × role  (role_permission)
 * Axis 2 — project × role (project_access)
 * Axis 3 — amount × role  (financial_power)   [procurement only]
 * Plus    — approval-chain stage role resolution (project override → global)
 */

/** Does the caller hold any role granting this permission? */
async function callerHasPermission(user: AppUser, action: string): Promise<boolean> {
  if (user.is_admin) return true;
  const roleKeys = user.roles.map((r) => r.role);
  if (roleKeys.length === 0) return false;
  const rows = await query<{ ok: boolean }>(
    `SELECT EXISTS (
        SELECT 1 FROM fnpc.role_permission
         WHERE permission_key = $1 AND role_key = ANY($2::text[])
     ) AS ok`,
    [action, roleKeys],
  );
  return rows[0]?.ok === true;
}

/** May the caller access this project at all? (admin bypass; legacy-permissive.) */
async function callerCanAccessProject(user: AppUser, projectId: string): Promise<boolean> {
  if (user.is_admin) return true;
  const roleKeys = user.roles.map((r) => r.role);
  const rows = await query<{ ok: boolean }>(
    `SELECT EXISTS (
        SELECT 1 FROM fnpc.project_access
         WHERE project_id = $1 AND role_key = ANY($2::text[])
     ) AS ok`,
    [projectId, roleKeys],
  );
  return rows[0]?.ok === true;
}

/** Express middleware: gate on action × role only. */
export function requirePermission(action: string) {
  return async (req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      if (!(await callerHasPermission(user, action))) {
        throw new ApiError(403, 'FORBIDDEN', `role(s) may not perform '${action}'`, {
          action,
          roles: user.roles.map((r) => r.role),
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware: gate on project × role, reading the project id from a route
 * param (default `:id`). Compose with requirePermission for the full
 * intersection the prototype enforces.
 */
export function requireProjectAccess(param = 'id') {
  return async (req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const projectId = req.params[param];
      if (!projectId) throw new ApiError(400, 'VALIDATION', `missing route param '${param}'`);
      if (!(await callerCanAccessProject(user, projectId))) {
        throw new ApiError(403, 'FORBIDDEN', `no access to project '${projectId}'`, { projectId });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Axis 3 — financial power. The approving role's threshold must cover the
 * document value (NULL threshold === unlimited, e.g. dg). admin bypasses.
 */
export async function assertFinancialPower(
  user: AppUser,
  roleForStage: string,
  amount: string,
): Promise<void> {
  if (user.is_admin) return;
  const rows = await query<{ threshold: string | null }>(
    `SELECT threshold FROM fnpc.financial_power WHERE role_key = $1`,
    [roleForStage],
  );
  if (rows.length === 0) return; // no power configured == no monetary ceiling
  const threshold = rows[0].threshold;
  if (threshold === null) return; // unlimited
  // Decimal-safe compare via numeric cast in SQL would be ideal; for the
  // scaffold a Number compare is adequate (values fit f64 range for display).
  if (Number(amount) > Number(threshold)) {
    throw new ApiError(422, 'BUSINESS_RULE', `amount exceeds ${roleForStage} financial power`, {
      amount,
      threshold,
      role: roleForStage,
    });
  }
}

/**
 * Resolve the role permitted to perform the NEXT stage of a document's
 * approval chain. Reads the project override (project_action_override) if
 * present, else the global default (approval_chain_stage). admin is always
 * retained as a permitted role. Returns the stage row + the resolved roles.
 */
export interface ResolvedStage {
  stage_index: number;
  stage_name: string;
  action: string;
  roles: string[]; // permitted roles (override or default), admin appended
}

export async function resolveNextStage(
  projectId: string,
  chainType: string,
  nextStageIndex: number,
): Promise<ResolvedStage> {
  const stages = await query<{
    stage_index: number;
    stage_name: string;
    role_key: string;
    action: string;
  }>(
    `SELECT stage_index, stage_name, role_key, action
       FROM fnpc.approval_chain_stage
      WHERE chain_type = $1 AND stage_index = $2`,
    [chainType, nextStageIndex],
  );
  if (stages.length === 0) {
    throw new ApiError(409, 'CONFLICT', 'chain already at final stage', {
      chainType,
      nextStageIndex,
    });
  }
  const stage = stages[0];

  const overrides = await query<{ role_keys: string[] }>(
    `SELECT role_keys FROM fnpc.project_action_override
      WHERE project_id = $1 AND action_key = $2`,
    [projectId, stage.action],
  );
  const baseRoles = overrides.length > 0 ? overrides[0].role_keys : [stage.role_key];
  const roles = Array.from(new Set([...baseRoles, 'admin'])); // admin always retained
  return {
    stage_index: stage.stage_index,
    stage_name: stage.stage_name,
    action: stage.action,
    roles,
  };
}

/** Does the caller hold one of the resolved roles for this stage? */
export function callerHoldsStageRole(user: AppUser, stage: ResolvedStage): boolean {
  if (user.is_admin) return true;
  const held = new Set(user.roles.map((r) => r.role));
  return stage.roles.some((r) => held.has(r));
}
