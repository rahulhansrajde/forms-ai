# Forms AI

Describe a Google Form in plain language, refine the draft in chat or in the editable preview, and publish it to Google Forms with an explicit **Create GForm** action.

Core rules enforced by the code:

- Chat never publishes. Only `POST /google-forms/publish` (the Create GForm button) creates a Google Form.
- AI output only ever produces or modifies a structured, validated form draft. It never calls Google.
- Every meaningful change (AI, manual, regeneration, accepted suggestions, restore) creates an immutable form version.
- A failed publish never touches the draft; it records the failed step and can be retried without creating a duplicate Google Form.

## Repository layout

```
shared/     @forms-ai/contracts: types shared by backend and frontend (form schema, operations, intents, API DTOs)
backend/    Node.js + TypeScript API (Express 5, PostgreSQL)
  src/domain          entities, value objects, ports (interfaces), pure domain services
  src/application     use cases and application services (intent engine, versioning, publishing)
  src/infrastructure  PostgreSQL repositories + migrations, Gemini and offline AI adapters, Google gateways, security
  src/presentation    controllers, routes, middleware, request validation
  src/composition     composition root wiring every dependency
frontend/   React + Vite + TypeScript single-page app
tests/e2e/  Playwright journeys (run against the real API with fake Google gateways)
```

## Requirements

- Node.js 22+ (developed on 24)
- PostgreSQL 13+ for real deployments. For local development and tests, the embedded engine (PGlite, real Postgres compiled to WebAssembly) can be used with `DATABASE_URL=pglite://./.data/pglite` or `pglite://memory`.

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | `postgres://user:password@localhost:5432/forms_ai`, or `pglite://./.data/pglite` for the embedded database |
| `TOKEN_ENCRYPTION_KEY` | base64 32-byte key used to encrypt Google tokens at rest. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | the Web Application OAuth client |
| `GOOGLE_REDIRECT_URI` | `http://localhost:5000/auth/google/callback` |
| `TEST_DATABASE_URL` | optional database (name must end in `_test`) for running the integration suite against real PostgreSQL with `npm run test:postgres`; it is reset on every run |
| `GEMINI_API_KEY` | enables Gemini (server side only) |
| `GEMINI_MODELS` | comma-separated fallback order, default `gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash` |
| `AI_PROVIDER` | `gemini` or `rule-based`. Defaults to `gemini` when a key is present, otherwise to the deterministic offline engine |

Never commit `.env`; it is git-ignored, as are OAuth client JSON files.

Create the databases (PostgreSQL only, using the credentials in `DATABASE_URL` / `TEST_DATABASE_URL`) and run migrations:

```bash
npm run db:create
npm run migrate
```

The API also applies pending migrations at startup.

## Running locally

```bash
npm run dev
```

- Frontend: http://localhost:3000 (the authorized JavaScript origin). Vite proxies API paths to the backend.
- API: http://localhost:5000. The OAuth redirect URI points here directly.

Google OAuth scopes requested: `openid`, `userinfo.email`, `userinfo.profile`, `forms.body`. No Drive scopes.

## Production

```bash
npm run build
FRONTEND_DIST_DIRECTORY=../frontend/dist NODE_ENV=production npm start
```

In production the API serves the built frontend, sets `Secure` cookies and applies a strict Content Security Policy. Set `TRUST_PROXY=true` behind a reverse proxy, and update the Google OAuth client with the production origin and redirect URI.

## Azure App Service

Forms AI deploys as a native Node.js app to Azure App Service (Linux) with Azure Database for PostgreSQL Flexible Server, through `.github/workflows/deploy.yml`:

1. Every push to `main` runs typecheck, lint, unit and integration tests, the PostgreSQL integration suite, the Playwright journeys and the production build.
2. The workflow assembles a ready-to-run package: the root, `shared`, `backend` and `frontend` manifests, the compiled `dist` folders and production-only `node_modules`.
3. It signs in to Azure with OpenID Connect (repository secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, no stored passwords) and deploys the package to the Web App named by the repository variable `AZURE_WEBAPP_NAME`.

App Service runs `npm start` from the package root, which starts the backend. The backend listens on the `PORT` App Service provides, serves the built frontend from the same origin, applies pending database migrations at startup (forward-only, never destructive) and reports health on `GET /health`.

Web App configuration:

| Setting | Value |
| --- | --- |
| Runtime stack | Node 24 LTS on Linux |
| Startup command | leave empty (`npm start` is used) |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `false` (the package is already built) |
| `NODE_ENV` | `production` |
| `FRONTEND_DIST_DIRECTORY` | `/home/site/wwwroot/frontend/dist` |
| `DATABASE_URL` | `postgres://<user>:<password>@<server>.postgres.database.azure.com:5432/<database>` (URL-encode special characters in the password) |
| `DATABASE_SSL` | `true` |
| `FRONTEND_ORIGIN` | the public URL of the app, for example `https://<app>.azurewebsites.net` |
| `GOOGLE_REDIRECT_URI` | `<public URL>/auth/google/callback`, also registered in the Google OAuth client together with the public URL as a JavaScript origin |
| `TRUST_PROXY` | `true` |
| `TOKEN_ENCRYPTION_KEY` | a base64 32-byte key; keep it stable, otherwise stored Google tokens cannot be decrypted |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AI_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODELS`, `SESSION_TTL_HOURS`, `DATABASE_MAX_CONNECTIONS` | as in `.env.example` |

`deploy.yml` is the only deployment path. Do not connect the repository through the Web App's Deployment Center, because it commits a second, generated workflow that would deploy without running the test suite.

`PORT` is set by App Service and must not be overridden. The Microsoft Entra application used by the workflow needs the Website Contributor role (or Contributor) on the Web App, and its federated credential must trust `repo:<owner>/<repository>:ref:refs/heads/main`.

## Quality gates

```bash
npm run typecheck   # shared, backend (including tests) and frontend
npm run lint        # ESLint plus a check that rejects any source-code comments
npm test            # backend unit + integration tests (PGlite Postgres), frontend component tests
npm run test:postgres  # backend integration tests against the real PostgreSQL TEST_DATABASE_URL
npm run build       # production builds
npm run test:e2e    # Playwright browser journeys (install browsers once: npx playwright install chromium)
npm run verify      # typecheck + lint + test + build
```

## API

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/signup` | create account and session |
| POST | `/auth/login` | log in |
| POST | `/auth/logout` | end session |
| GET / PATCH | `/auth/me` | current user / update profile |
| POST | `/auth/password` | change password (ends other sessions) |
| POST / GET | `/conversations` | create / list conversation metadata (cursor pagination) |
| GET | `/conversations/:id` | conversation detail with active draft id |
| GET / POST | `/conversations/:id/messages` | latest 50 messages with `cursor` for older pages / send a message |
| GET | `/drafts/:id` | draft with current version and publication state |
| GET / POST | `/drafts/:id/versions` | version history / new version from operations or restore |
| GET | `/drafts/:id/versions/:versionId` | a specific immutable version |
| GET | `/auth/google`, `/auth/google/callback` | Google OAuth connect flow (state-protected) |
| GET / DELETE | `/integrations/google/status`, `/integrations/google` | connection status / disconnect |
| POST | `/google-forms/publish` | explicit Create GForm |

## AI providers

`GeminiAIProvider` calls the Gemini API with structured JSON output whose schemas are derived from the same zod schemas the application validates against (reduced to structural keywords, because Gemini rejects heavily constrained schemas; every limit is still enforced afterwards). `ModelFallbackInvoker` walks `GEMINI_MODELS` in order: it moves to the next model on 404/unavailable models, 408/429/5xx, network failures and empty responses, skips a model that reported itself unavailable for ten minutes, and stops immediately on permanent errors such as an invalid key, a permission error or a blocked prompt. Only the model name, HTTP status and error reason are logged.

`RuleBasedAIProvider` is a deterministic offline engine (intent rules, form templates, operation planner, suggestion catalog) used when no API key is configured and in automated tests. Both providers return untrusted data that is validated and normalized before anything changes.
