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

## Deploying to Render

This repo includes a Blueprint at `render.yaml` that provisions the API + a
managed Postgres together.

1. Push the repo to GitHub.
2. Render Dashboard → **New → Blueprint** → select this repo → **Apply**.
   It creates `nlc-ecc-api` (web) and `nlc-ecc-db` (Postgres) and wires
   `DATABASE_URL` automatically.
3. On first deploy the **pre-deploy command** (`node scripts/migrate.js`)
   loads `db/schema.sql` (only if not already present) and seeds a demo admin
   user `demo` (because `SEED_DEV_USER=1`).
4. Set **`CORS_ORIGIN`** on the web service to your SPA origin
   (e.g. `https://<user>.github.io`). It's left blank in the Blueprint so you
   can fill it in the dashboard.
5. Verify: `GET https://<service>.onrender.com/api/health` → `{ "ok": true }`.
   Authenticated calls need the dev header `X-User: demo` until SSO lands.

**Notes**
- Free web services sleep after 15 min idle (cold start ~30–60 s); free
  Postgres expires after 30 days — upgrade to a paid instance for anything
  persistent.
- `region` for the web service and the database **must match**.
- The `X-User` header is a development stand-in. Before real production use,
  replace `authenticate()` with OIDC/SAML token validation and remove
  `SEED_DEV_USER`.
