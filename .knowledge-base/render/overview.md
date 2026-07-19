# Render (Blueprint / render.yaml)

Official docs: https://render.com/docs/blueprint-spec

## Syntax / Usage Cheatsheet

- A Blueprint is a `render.yaml` at the repo root describing one or more services declaratively: top-level `services:` list plus an optional `databases:` list.
- Each service needs `name` (unique id), `type` (`web`, `pserv` for private services, `worker`, `cron`, `keyvalue`), and `runtime` (`node`, `python`, `docker`, `image`, `static`, ...).
- Standard app service: `buildCommand:` and `startCommand:` under the service entry.
- Static frontend service: `runtime: static` plus required `staticPublishPath:` (the built output directory, e.g. `./dist`).
- **Monorepo scoping** via `buildFilter`: `paths:` (glob list — only these path changes trigger a rebuild of this service) and `ignoredPaths:` (glob list explicitly excluded even if matched by `paths`) — this is how one `render.yaml` avoids rebuilding the Django service on a frontend-only commit and vice versa.
- `rootDir:` sets the service's working directory within the monorepo (commands run relative to it) — typically paired with `buildFilter.paths` scoped to that same subtree.
- `databases:` entries are separate top-level resources: `name`, `plan` (e.g. `basic-256mb`), `region`.
- `envVars:` supports both hardcoded values (`{ key: API_KEY, value: ... }`) and cross-resource references (`{ key: DB_HOST, fromDatabase: { name: my-db, property: host } }`) — referenceable properties include `host`, `port`, `connectionString`.

## Project-Specific Gotchas

- **No `render.yaml` exists yet** in this repo. Given the `backend/` (Django/DRF, uv-managed) and `frontend/` (Vite static build, npm-managed) split, this is a textbook two-service Blueprint: a `web` service with `runtime: python` and `rootDir: backend` for the API, plus a `web` service with `runtime: static` and `rootDir: frontend`, `staticPublishPath: dist` for the built frontend — each needs its own `buildFilter.paths` scoped to its subtree (`backend/**` vs `frontend/**`) so an unrelated change doesn't trigger a needless redeploy of the other service.
- `buildFilter.paths` for the backend service should also include any shared root-level config that affects it (e.g. if a root `docs/` or `.github/` change should _not_ trigger a backend redeploy, make sure the glob is scoped tightly to `backend/**` rather than defaulting to "whole repo" — Render's default without a `buildFilter` is to rebuild on any change anywhere in the repo, which defeats the point of a monorepo split).
- The static frontend service needs its `buildCommand` to actually run `npm run build` (which itself runs `tsc -b && vite build` per `frontend/package.json`) — a `staticPublishPath` misconfigured relative to `rootDir` (e.g. pointing at `frontend/dist` when `rootDir` is already `frontend`, versus just `dist`) is a common source of "build succeeded, deploy serves nothing" failures.
- Postgres for the backend should be declared under top-level `databases:`, then wired into the backend service's `envVars` via `fromDatabase` — matches this repo's `psycopg[binary]` and `django-environ` dependencies (`django-environ` typically reads a single `DATABASE_URL`-style env var, so the `connectionString` property is likely the right one to reference, not individual `host`/`port`/`user` fields).

## Minimal Example

```yaml
# render.yaml
databases:
  - name: riser-db
    plan: basic-256mb
    region: oregon

services:
  - name: riser-backend
    type: web
    runtime: python
    rootDir: backend
    buildFilter:
      paths: ["backend/**"]
    buildCommand: uv sync --locked
    startCommand: uv run gunicorn config.wsgi:application
    envVars:
      - key: DATABASE_URL
        fromDatabase: { name: riser-db, property: connectionString }

  - name: riser-frontend
    type: web
    runtime: static
    rootDir: frontend
    staticPublishPath: dist
    buildFilter:
      paths: ["frontend/**"]
    buildCommand: npm ci && npm run build
```

## References

- https://render.com/docs/blueprint-spec
