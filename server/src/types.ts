import { Request } from 'express';

/** A role grant resolved from user_role; scope_node === null means org-wide. */
export interface RoleGrant {
  role: string;
  scope_node: string | null;
}

/** The authenticated caller, resolved from the IdP token (or the dev stand-in). */
export interface AppUser {
  id: number;
  username: string;
  display_name: string;
  roles: RoleGrant[];
  is_admin: boolean;
}

/** Express request after the authenticate() middleware has run. */
export interface AuthedRequest extends Request {
  user?: AppUser;
}

/** Money is carried as a decimal string end-to-end (NUMERIC on the wire). */
export type Money = string;

/** Standard error envelope. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
