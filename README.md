# SubMate — Subscription & Renewal Tracker

Know what’s coming, and feel good about what stays. SubMate is a local, single-user
subscription manager backed by a real SQLite database. Renewals, budgets, and spend
patterns are tracked without a cloud account — everything lives on your machine.

## Features

- **Real persistence** — subscriptions and preferences are stored in `data/submate.sqlite`
- **Catalog with local logos** — pick a service from a 68-entry catalog; bundled Simple Icons
  are used where available, with branded local marks for the rest
- **Local login** — protect the single-user tracker with a passphrase stored as a salted hash
  in SQLite; authenticated API requests use an HTTP-only local session cookie
- **Renewal timeline** — a monthly calendar plus Overdue / Next 7 days / Next 30 days
  roll-up with reminder thresholds (defaults: 3 and 7 days)
- **Spend analytics** — monthly & annual totals, category breakdown, most-expensive plans
- **Budgets** — set a monthly limit per currency with a live progress meter
- **Duplicate protection** — adding the same service warns you (with an option to force it)
- **CSV export** — one-click download of all subscriptions (formula-injection safe)
- **Multiple currencies** — never combined; totals are reported per currency

## Requirements

- Node.js **22.13+** (uses the built-in `node:sqlite` driver — no native build step)
- npm

## Getting started

```bash
npm install
npm run dev      # starts API (http://127.0.0.1:3001) + Vite dev server with /api proxy
```

Open the printed Vite URL. On first launch, create a local workspace name and passphrase;
later launches show an unlock screen. Then add your first subscription. The passphrase is
not recoverable through a cloud account; keep a safe copy if you need continued access to
the local data file.

Production-style run:

```bash
npm run build    # Vite production bundle into dist/
npm start        # serves the bundle + API from one Node process on http://127.0.0.1:3001
```

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Run API and Vite together (Concurrently) |
| `npm run build` | Production frontend bundle |
| `npm start` | Serve built app + API |
| `npm test` | Server tests then web tests |
| `npm run test:server` | `node --test "tests/**/*.test.js"` |
| `npm run test:web` | Vitest (jsdom) |
| `npm run test:coverage` | Server tests with Node's coverage report |
| `npm run ci` | Full pipeline locally: build → test → lint → coverage |
| `npm run lint` | ESLint over the whole repo |
| `npm run generate:logos` | Regenerate bundled brand marks from the catalog |
| `npm run db:reset` | Delete the local database (requires `--yes` confirmation) |
| `npm run db:backup` | Snapshot the database to `<data dir>/backups` |

## Project structure

```
server/            Express API, SQLite schema, services, validation
  config.js        paths, port, environment overrides
  db/              connection + migrations
  repositories/    data access for subscriptions and settings
  routes/          health, catalog, subscriptions, dashboard, settings, export
  services/        calculations, renewals, duplicates, CSV, dashboard, money
  validation/      payload + query validation
scripts/           logo generator, DB reset, DB backup
src/               React frontend
  api/             API client
  context/         data provider + mutations + toast
  components/      UI primitives, sidebar, header, forms, modals
  pages/           Welcome, Overview, Subscriptions, Renewals, Analytics, Budget, Settings
tests/             server-side integration + unit tests
.github/workflows  ci.yml (build/test/lint), cd.yml (image + deploy)
Dockerfile         multi-stage image (build bundle, run server)
fly.toml           Fly.io app config (single machine + persistent volume)
```

## API overview

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Server + DB health |
| `GET` | `/api/auth/status` | Check whether local setup or unlock is needed |
| `POST` | `/api/auth/setup` | Create the local passphrase and first session |
| `POST` | `/api/auth/login` | Unlock the local tracker |
| `POST` | `/api/auth/logout` | Lock the tracker and revoke the local session |
| `GET` | `/api/catalog` | Catalog services + categories |
| `GET` | `/api/catalog/q?q=…` | Catalog search |
| `GET` | `/api/subscriptions` | List/filter/sort (`q`, `category`, `status`, `billingCycle`, `renewalWindow`, `sortBy`, `order`) |
| `POST` | `/api/subscriptions` | Create (409 + `DUPLICATE_WARNING` for duplicates; `?force=true` to bypass) |
| `GET/PUT/DELETE` | `/api/subscriptions/:id` | Read, update, delete |
| `PATCH` | `/api/subscriptions/:id/status` | Change status (`active`/`paused`/`cancelled`) |
| `GET` | `/api/dashboard` | Aggregated metrics, budgets, upcoming renewals |
| `GET/PUT` | `/api/settings` | Preferences (currency, budget, reminder thresholds) |
| `GET` | `/api/export.csv` | Download subscriptions as CSV |

All catalog, subscription, settings, dashboard, and export endpoints require an active local
session. Errors use a consistent shape: `{ "error": { "message", "code", "details" } }`.

## Storage & configuration

- Database: `data/submate.sqlite`, created automatically (WAL mode, migrations tracked).
- Env overrides: `SUBMATE_DB_PATH`, `SUBMATE_DATA_DIR`, `SUBMATE_PORT`, `PORT`, `HOST`.
- Backups: `npm run db:backup` writes a consistent snapshot to `<data dir>/backups`
  (override with `SUBMATE_BACKUP_DIR`; control retention with `SUBMATE_BACKUP_KEEP`,
  default 7). See `.env.example` for the full list.

## CI/CD pipeline

GitHub → Build → Automated Testing → Code Quality Check → Deployment.

| Stage | Where | What runs |
| --- | --- | --- |
| Build | `ci.yml`, `cd.yml` | `npm run build` (Vite bundle) / Docker image build |
| Automated Testing | `ci.yml` | `npm test` (server + web), plus a built-server smoke test |
| Code Quality Check | `ci.yml` | `npm run lint` + `npm run test:coverage` |
| Deployment | `cd.yml` | Push image to GHCR → **approval-gated** deploy to Fly.io |

`ci.yml` runs on every push/PR to `main` across Node 22 and 24. `cd.yml` is
**manual-only** (`workflow_dispatch`); its `deploy` job targets the `production`
GitHub Environment, so it pauses for required reviewers before touching the host.

## Deployment (Docker + GHCR + Fly.io)

The image is self-contained (multi-stage `Dockerfile`); SQLite data lives on a
mounted volume, not inside the image.

1. **Image** — `cd.yml` builds from `Dockerfile` and pushes to
   `ghcr.io/<owner>/<repo>` using the built-in `GITHUB_TOKEN` (no extra secret).
2. **Host** — update `app` and `primary_region` in `fly.toml`, then create the app
   and a 1 GB volume (SQLite is a single-writer DB — keep one machine):
   ```bash
   flyctl apps create <your-app-name>
   flyctl volumes create submate_data --region <region> --size 1
   ```
3. **GitHub config** — add these so `cd.yml` can deploy:
   - Variable `FLY_APP` = your Fly app name
   - Secret `FLY_API_TOKEN` = output of `flyctl tokens create deploy -x 999999h`
   - Environment `production` with required reviewers (the approval gate)
4. **Run it** — Actions → **CD** → *Run workflow* (optionally set `image_tag`).

Runtime env (set in `fly.toml`): `HOST=0.0.0.0`, `SUBMATE_DATA_DIR=/app/data`,
`NODE_ENV=production`. Back up before a deploy with `flyctl ssh console` +
`npm run db:backup`, or rely on Fly's automatic volume snapshots.

## Notes

- Currencies are never mixed: spend totals, category breakdowns, and budgets are reported
  per currency.
- Only `active` subscriptions count toward spend and reminders; `paused` and `cancelled`
  are excluded.
- No analytics, telemetry, or network calls — your data stays local.
