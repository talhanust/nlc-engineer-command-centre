# Deploying the API to Vercel (free, no credit card)

Vercel runs the Express app as a serverless function via `api/index.ts` +
`vercel.json` (rewrites all routes to the function). The schema migration is
run once from your laptop against Neon, so no pre-deploy step is needed.

## 1. Load the schema into Neon (once, from your machine)
Use the Neon **direct** connection string for DDL (the "Connection parameters"
tab → unpooled host), not the pooled one:
```bash
cd server
npm install
DATABASE_URL='postgresql://USER:PASS@DIRECT-HOST/neondb?sslmode=require' \
  SEED_DEV_USER=1 node scripts/migrate.js
# expect: schema loaded → app_doc ready → ensured dev admin user 'demo'
```

## 2. Create the Vercel project
- vercel.com → **Add New → Project** → import `talhanust/nlc-engineer-command-centre`.
- **Root Directory**: `server`
- Framework preset: **Other** (no build needed; the function is built automatically).
- Environment Variables:
  - `DATABASE_URL` = your Neon **pooled** string (PgBouncer host, ideal for serverless)
  - `CORS_ORIGIN` = `https://talhanust.github.io`
  - `DEV_USER_NAME` = `demo`
- Deploy.

## 3. Smoke test
```bash
curl -s https://<project>.vercel.app/api/health           # {"ok":true}
curl -s -X PUT https://<project>.vercel.app/api/state/smoke:1 \
  -H 'X-User: demo' -H 'Content-Type: application/json' -d '{"hello":"world"}'
curl -s https://<project>.vercel.app/api/state -H 'X-User: demo'  # echoes smoke:1
```

## Notes
- Use the **pooled** Neon string at runtime (handles serverless connection churn);
  use the **direct** string only for the one-time migration in step 1.
- No cold-start sleep penalty like Render's free web service, but Neon itself
  scales to zero — the first query after idle may take a second or two.
- The `X-User` header is the dev auth stand-in; replace with OIDC for production.
