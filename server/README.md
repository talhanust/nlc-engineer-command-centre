# FGEHA × NLC — Reference Server Scaffold (Node + Express + TypeScript)

A **reference scaffold**, not the finished backend. It demonstrates, in real
compiling code, the load-bearing parts of the target architecture so the team
has a concrete starting point:

- the **three-axis authorization layer** (`src/authz.ts`) — action×role,
  project×role, amount×role — plus approval-chain stage-role resolution with
  per-project overrides and `admin` retained;
- the **persistence-cutover endpoints** (`src/routes/projects.ts`) that replace
  the single-file app's `localStorage` (migration milestone M2);
- an **entity endpoint with a real state machine** (`src/routes/ipcs.ts` — the
  IPC pipeline) showing server-authoritative transitions and money;
- an **access-scoped roll-up** (`src/routes/rollup.ts`) where the scope is
  applied *inside* the aggregation;
- the **chain-advance primitive** (`src/routes/demands.ts`) that is uniform
  across all six approval chains because the divergence is data, not code;
- an **immutable audit write** on every mutation (`src/audit.ts`).

It targets the schema in `../fgeha_nlc_schema.sql` and the endpoints in
`../FGEHA_NLC_API_Contract.md`.

## Why Node/Express/TypeScript
Chosen as the default because the existing project already runs Node for all 44
smoke-test suites — the smallest skills delta and toolchain reuse. The data
model and API contract are stack-neutral; re-targeting .NET / Java-Spring /
FastAPI changes only this scaffold, not the contract.

## What is deliberately NOT done here
- **Real auth.** `src/auth.ts` accepts a dev `X-User: <username>` header as a
  stand-in. Production replaces it with AD/SSO token validation (OIDC/SAML) —
  migration milestone M3. The dev header MUST be disabled in production.
- **Full state assembly / diff.** The state GET/PUT show the pattern for IPCs +
  salients; the remaining slices (financial/execution/mapping/procurement)
  follow the same shape.
- **Decimal-exact summation in JS.** Roll-up totals use a placeholder Number
  sum; production should SUM in SQL with NUMERIC or use a decimal library.
- **Input validation library, rate limiting, CSRF, secrets management.** Noted
  in the non-functional requirements; wire in at milestone M4.

## Run
```
npm install
cp .env.example .env          # point at a PostgreSQL with fgeha_nlc_schema.sql loaded
npm run typecheck             # tsc --noEmit (this scaffold compiles clean)
npm run dev                   # ts-node src/index.ts   (or: npm run build && npm start)

# smoke it (dev auth header):
curl -H 'X-User: a.khan' localhost:3000/api/me
curl -H 'X-User: a.khan' localhost:3000/api/projects
```

## Layout
```
src/
  index.ts            express bootstrap + central error envelope
  db.ts               pg pool + transaction helper
  types.ts            AppUser / AuthedRequest / ApiError
  auth.ts             authenticate() — dev X-User stand-in for AD/SSO
  authz.ts            the three-axis gate + chain stage-role resolution
  audit.ts            writeAudit() — immutable trail
  routes/
    me.ts             GET /me
    projects.ts       list (access-scoped) + state GET/PUT (M2 cutover)
    ipcs.ts           register + create + pipeline transitions
    rollup.ts         access-scoped node roll-up
    demands.ts        approval-chain advance primitive
```

## Deploying free on Render (no credit card)

Render free **web services** need no card. Render's free **Postgres expires
after ~30 days**, so use a free external Postgres that doesn't expire — Neon
(neon.tech) or Supabase — and keep only the web service on Render. The
Blueprint at `render.yaml` is already set up for this.

1. **Free Postgres (no card):** create a project at https://neon.tech and copy
   its connection string, e.g.
   `postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`.
   (For loading the schema, prefer Neon's *direct* connection string over the
   *pooled* one.)
2. Push this repo to GitHub.
3. Render → **New → Blueprint** → select this repo → **Apply** (creates the
   `nlc-ecc-api` web service only).
4. When prompted, paste your Neon URL as **`DATABASE_URL`**, and set
   **`CORS_ORIGIN`** to your SPA origin (e.g. `https://<user>.github.io`).
5. First deploy runs `node scripts/migrate.js`, which loads `db/schema.sql`
   once (idempotent) and seeds a demo admin `demo` (`SEED_DEV_USER=1`).
6. Verify `GET https://<service>.onrender.com/api/health` → `{ "ok": true }`.
   Authenticated calls use the dev header `X-User: demo` until SSO lands.

**Notes**
- Free web services sleep after 15 min idle (cold start ~30–60 s) — fine for a
  demo. 750 compute-hours/month, no card.
- If Render still prompts you for a card on the web service (rare, anti-fraud),
  alternatives with free no-card tiers include Railway (trial credits),
  Cloudflare/Vercel (edge functions), or running the same Node server on
  Fly.io/Northflank.
- The `X-User` header is a dev stand-in. For production, replace
  `authenticate()` with OIDC/SAML token validation and remove `SEED_DEV_USER`.

## Operating-model document store (api-mode parity)

The reference relational routes cover the core entities (projects, IPCs,
demands, roll-up). The rest of the operating model — distribution planner,
contractor/PEC, billing chains, overheads, mapping + material recovery,
inventory/POL/assets/maintenance, HR, progress — is persisted via a generic
JSONB document store so api mode behaves exactly like the offline demo:

- Table `fnpc.app_doc (scope_key TEXT PK, value JSONB, updated_at)` (created by
  `scripts/migrate.js`).
- Routes: `GET /api/state` (all docs → `{ docs: { key: value } }`),
  `PUT /api/state/:key` (upsert; body is the raw JSON value),
  `DELETE /api/state/:key`.
- The SPA's `RemoteKvStore` hydrates all docs once, serves the provider's
  synchronous store interface from memory, and writes through on every change.
  The provider logic is identical to local mode — only the backing store differs.

This is a deliberate delivery tradeoff: it makes the full feature set work and
persist immediately. Hot, query-heavy entities can be normalised into dedicated
relational tables later without changing the SPA.
