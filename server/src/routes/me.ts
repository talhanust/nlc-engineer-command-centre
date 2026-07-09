import { Router, Response, NextFunction } from 'express';
import { AuthedRequest } from '../types';
import { requireUser } from '../auth';

export const meRouter = Router();

// GET /api/me — the caller's identity + effective roles (UI chrome only;
// the server re-checks every action regardless of what the client shows).
meRouter.get('/me', (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const u = requireUser(req);
    res.json({
      user: { id: u.id, username: u.username, display_name: u.display_name },
      roles: u.roles,
      is_admin: u.is_admin,
    });
  } catch (err) {
    next(err);
  }
});
