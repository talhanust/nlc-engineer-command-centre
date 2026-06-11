# Deploying on GitHub — step by step

This deploys the **static demo** (single-user, `local` mode) to **GitHub Pages**, and uses GitHub for **source + CI**. The real multi-user app + database deploy to **NLC on-prem** infrastructure (see the last section) — not to GitHub.

## Prerequisites
- A GitHub account, `git` installed, Node 20+ locally (to test before pushing).
- Optionally the GitHub CLI (`gh`) — both CLI and web-UI paths are shown.

## Step 0 — Pick the repository name (this matters for Pages)
GitHub Pages serves a *project* site under `https://<you>.github.io/<repo>/`, so the app must be built with a matching base path. The workflow is preset to `VITE_BASE=/nlc-engineer-command-centre/`.
- **Easiest:** name the repo exactly **`nlc-engineer-command-centre`** and change nothing.
- **If you use a different name:** edit `.github/workflows/pages.yml` and set `VITE_BASE: /<your-repo-name>/` (keep the leading and trailing slashes).
- **User/org site** (repo named `<you>.github.io`): set `VITE_BASE: /`.

## Step 1 — Get the code onto your machine
Unzip the project, then from inside the folder:
```bash
git init
git add .
git commit -m "chore: initial import of NLC Engineer Command Centre"
git branch -M main
```

## Step 2 — Create the GitHub repo and push
**Recommendation:** make it **private** (or use on-prem GitHub Enterprise) given the data-residency requirement. The repo holds no real data, but private is the safe default.

**Option A — GitHub CLI:**
```bash
gh repo create nlc-engineer-command-centre --private --source=. --remote=origin --push
```

**Option B — Web UI:**
1. github.com → **New repository** → name `nlc-engineer-command-centre` → **Private** → **Create** (do not add a README/.gitignore; you already have them).
2. Then locally:
   ```bash
   git remote add origin https://github.com/<you>/nlc-engineer-command-centre.git
   git push -u origin main
   ```

## Step 3 — Watch CI run
Open the repo → **Actions** tab. The push triggers **CI** (web typecheck/test/builds, server typecheck + Postgres schema load, prototype parity). Confirm it goes green. If something fails, the logs point to the job; fix and push again.

## Step 4 — Turn on GitHub Pages
1. Repo → **Settings** → **Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions** (not "Deploy from a branch").
3. That's it — the included `pages.yml` is the Pages workflow. It runs on every push to `main`.

> If your account/plan doesn't allow Pages on private repos, either make the repo public (the demo contains no real data) or skip Pages and run the demo locally with `npm run dev`.

## Step 5 — Trigger and verify the demo deploy
The Pages deploy runs automatically on push to `main`. To run it on demand: **Actions → Deploy demo to GitHub Pages → Run workflow**.
When it finishes, the URL appears in:
- **Actions** → the deploy job summary (`page_url`), and
- **Settings → Pages** ("Your site is live at …").

It will be `https://<you>.github.io/nlc-engineer-command-centre/`. Open it — you should see the NLC Engineer Command Centre shell with the org tree (served by `LocalDataProvider`). White page or 404 almost always means `VITE_BASE` doesn't match the repo name (see Step 0).

## Step 6 — Protect main (recommended)
Settings → **Branches** → **Add branch ruleset/protection** for `main`: require a pull request and require the **CI** status checks to pass before merging. Now every change is gated by the parity + build checks.

## Step 7 — Day-to-day
- Open issues from `docs/BACKLOG.md`, branch per `CONTRIBUTING.md`, PR into `main`.
- Each merge to `main` re-runs CI and re-publishes the demo automatically.

---

## Deploying the REAL app (not on GitHub)
The multi-user system and live NLC data run on the organization's own infrastructure:
1. Build the front end for the backend: `VITE_DATA_MODE=api VITE_API_BASE_URL=https://<internal-api> npm --workspace @nlc-ecc/web run build`, and serve `apps/web/dist` from NLC's internal web tier.
2. Run `server/` (Node) + **PostgreSQL** (load `db/schema.sql`) inside the network, behind **AD/SSO**. `docker-compose.yml` shows the topology for local full-stack dev; production uses NLC's standard deployment + backups.
3. Keep GitHub for source, code review, and CI only. **Never put real data or secrets in the repo or on Pages.**
