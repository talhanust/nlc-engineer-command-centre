import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../src/app';

// Reuse one app instance across warm invocations.
const app = createApp();

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Express is a (req, res) handler; Vercel's req/res are Node-compatible.
  return (app as unknown as (rq: VercelRequest, rs: VercelResponse) => void)(req, res);
}
