import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth';
import { ApiError } from './types';
import { meRouter } from './routes/me';
import { projectsRouter } from './routes/projects';
import { ipcsRouter } from './routes/ipcs';
import { rollupRouter } from './routes/rollup';
import { demandsRouter } from './routes/demands';
import { stateRouter } from './routes/state';

const app = express();
app.use(express.json({ limit: '8mb' }));

// CORS — allow the SPA origin(s) listed in CORS_ORIGIN (comma-separated).
// Defaults to '*' for easy first-deploy; set it to the GitHub Pages URL in prod.
const corsOrigins = (process.env.CORS_ORIGIN ?? '*').split(',').map((s) => s.trim());
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.header('Origin');
  const allow = corsOrigins.includes('*') ? '*' : (origin && corsOrigins.includes(origin) ? origin : '');
  if (allow) {
    res.setHeader('Access-Control-Allow-Origin', allow);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User, Authorization');
  }
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// Health check (unauthenticated).
app.get('/api/health', (_req: Request, res: Response) => res.json({ ok: true }));

// Everything under /api requires an authenticated caller.
app.use('/api', authenticate);
app.use('/api', meRouter);
app.use('/api', projectsRouter);
app.use('/api', ipcsRouter);
app.use('/api', rollupRouter);
app.use('/api', demandsRouter);
app.use('/api', stateRouter);

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
