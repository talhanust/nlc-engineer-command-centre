import { Response, NextFunction } from 'express';
import { query } from './db';
import { AppUser, AuthedRequest, RoleGrant, ApiError } from './types';

/**
 * authenticate() resolves the caller to an AppUser.
 *
 * PRODUCTION (migration milestone M3): validate the AD/SSO bearer token
 * (OIDC) or session (SAML), read the IdP subject, and look up app_user by
 * idp_subject. This scaffold accepts a development `X-User: <username>`
 * header as a STAND-IN so the rest of the stack can be built and tested
 * before the IdP integration lands. It must be disabled in production.
 */
export async function authenticate(
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const username = req.header('X-User'); // DEV ONLY — replace with token validation
    if (!username) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'no X-User header (dev) / token (prod)');
    }

    const users = await query<{ id: number; username: string; display_name: string }>(
      `SELECT id, username, display_name
         FROM fnpc.app_user
        WHERE username = $1 AND is_active = TRUE`,
      [username],
    );
    if (users.length === 0) {
      throw new ApiError(401, 'UNAUTHENTICATED', `unknown user '${username}'`);
    }
    const u = users[0];

    const grants = await query<RoleGrant>(
      `SELECT role_key AS role, scope_node FROM fnpc.user_role WHERE user_id = $1`,
      [u.id],
    );

    const user: AppUser = {
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      roles: grants,
      is_admin: grants.some((g) => g.role === 'admin'),
    };
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/** Convenience: pull the authenticated user or throw. */
export function requireUser(req: AuthedRequest): AppUser {
  if (!req.user) throw new ApiError(401, 'UNAUTHENTICATED', 'not authenticated');
  return req.user;
}
