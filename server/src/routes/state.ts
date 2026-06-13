import { Router, Response, NextFunction } from 'express';
import { AuthedRequest, ApiError } from '../types';
import { requireUser } from '../auth';
import { docs } from '../docstore';

export const stateRouter = Router();

// GET /api/state — return all operating-model documents as { docs: { key: value } }.
stateRouter.get('/state', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    requireUser(req);
    res.json({ docs: await docs.list() });
  } catch (err) { next(err); }
});

// PUT /api/state/:key — upsert one document. Body is the raw JSON value.
stateRouter.put('/state/:key', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    requireUser(req);
    const key = req.params.key;
    if (!key || key.length > 300) throw new ApiError(400, 'BAD_KEY', 'invalid document key');
    await docs.set(key, req.body ?? null);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/state/:key — remove one document.
stateRouter.delete('/state/:key', async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    requireUser(req);
    await docs.del(req.params.key);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
