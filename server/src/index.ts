import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth';
import { ApiError } from './types';
import { meRouter } from './routes/me';
import { projectsRouter } from './routes/projects';
import { ipcsRouter } from './routes/ipcs';
import { rollupRouter } from './routes/rollup';
import { demandsRouter } from './routes/demands';

const app = express();
app.use(express.json({ limit: '8mb' }));

// Health check (unauthenticated).
app.get('/api/health', (_req: Request, res: Response) => res.json({ ok: true }));

// Everything under /api requires an authenticated caller.
app.use('/api', authenticate);
app.use('/api', meRouter);
app.use('/api', projectsRouter);
app.use('/api', ipcsRouter);
app.use('/api', rollupRouter);
app.use('/api', demandsRouter);

// Central error handler — emits the standard envelope.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'internal error', details: {} } });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`FGEHA×NLC reference server listening on :${port}`);
});
