# Forms AI

Forms AI is a chat workspace that turns a plain-English request into a Google Form, and lets you create, read and update Google Sheets the same way. You describe what you need, review an editable draft, refine it in conversation, and publish only when you press the button.

```
"Create a college hackathon registration form."  →  editable draft  →  "Remove phone number."  →  Create GForm  →  live form + QR code
```

---

## Problem statement

**Who has the problem.** Teachers, college clubs and hackathon organisers, event and HR teams, NGOs and small-business owners. They collect information through Google Forms and track it in Google Sheets all the time, and most of them aren't technical.

**What the problem is.**

- **Building a form by hand is slow and repetitive.** Every question, type, option, section and *Required* flag is clicked in one at a time, and every small change means more clicking.
- **Good forms need know-how people don't have.** It's easy to forget key questions, pick the wrong question type, or write confusing options. Then the data has to be collected again.
- **The data ends up in spreadsheets that are tedious to maintain.** Finding one record, fixing a value or adding a column means scrolling, filtering and editing cells by hand. Mistakes are easy, especially when two people share a name.
- **AI chat tools don't close the gap.** They can suggest questions as text, but someone still has to rebuild the form in Google Forms. Letting an AI change live data by itself is risky.

**Why it matters.** Forms are the front door for registrations, feedback, admissions, surveys and leads. Hours spent on form-building and spreadsheet upkeep are hours not spent running the event, class or business. Badly designed forms produce incomplete or messy data that's expensive to fix later.

**What Forms AI does about it.** You describe the form in one sentence, refine it by chatting, and publish a real Google Form to your own account in one click. You can then read and update the linked Google Sheet in plain English. Nothing is published or written without your explicit confirmation, every change is versioned, and an ambiguous record (two students named Ananya) prompts a question instead of a guess.

---

## Project materials

| File | What it is |
| --- | --- |
| [`Forms-AI-Demo.mp4`](Forms-AI-Demo.mp4) | Narrated product demo (1 min 45 s) |
| [`Forms-AI-Pitch-Deck.pdf`](Forms-AI-Pitch-Deck.pdf) | Pitch deck (PDF) |
| [Run guide](#run-guide) · [Deployment](#deployment) | How to run locally and deploy to production |

---

## Contents

1. [Problem statement](#problem-statement)
2. [Project materials](#project-materials)
3. [Overview](#overview)
4. [Architecture](#architecture)
5. [Setup](#setup)
6. [Run guide](#run-guide)
7. [Usage](#usage)
8. [Configuration reference](#configuration-reference)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Troubleshooting](#troubleshooting)
12. [License](#license)

---

## Overview

### What it does

| Area | Capabilities |
| --- | --- |
| **Form drafting** | Create a form from a sentence, then modify, regenerate or extend it by chatting. Every change is saved as a new numbered version you can switch between. |
| **Suggestions** | Ask "What else can I ask?" to get suggested questions; accept all or some ("add 1 and 3", "add everything except the last one"). Your draft is untouched until you accept. |
| **Manual editing** | A side-panel editor for titles, descriptions, sections, question types, choices and the *Required* toggle. Edits create versions too. |
| **Publishing** | **Create GForm** publishes the selected version to the user's own Google account after a confirmation dialog. The result shows *Open form*, *Open editor* and a QR code. Failed publishes keep the draft and can be retried. |
| **Google Sheets** | Create a new sheet, link an existing one by URL, read rows into a table, ask single-record questions ("What is Priya's department?") and change data. Writes only happen after you click **Apply changes**; destructive changes need a second confirmation. Ambiguous records (two students named Ananya) prompt for an ID instead of guessing. |
| **Workspace** | Email/password accounts, chat history sidebar, chat deletion with a 5-second undo, light/dark theme, responsive layout from 320 px phones to desktop, settings for profile, password, Google connection and preferences. |

### Safety by design

- The AI never publishes or writes on its own: Google Forms and Sheets are changed only through explicit buttons.
- Google OAuth tokens are encrypted at rest with AES-256-GCM; passwords are hashed with scrypt.
- Sessions use HTTP-only cookies, with an origin guard, Helmet security headers, CSP and per-route rate limits.

### Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, React Router 7, Vite 7, CSS modules |
| Backend | Node.js, Express 5, Zod, TypeScript (clean-architecture layers) |
| Shared contracts | `@forms-ai/contracts` workspace: form schema, operations, intents, API types |
| Database | PostgreSQL 17 in production; embedded **PGlite** for local development and tests |
| AI | Amazon Bedrock (default model `zai.glm-5`, with fallback list), or a built-in **rule-based** engine that needs no API key |
| Google | OAuth 2.0, Google Forms API, Google Sheets API |
| Testing | Vitest, Testing Library, Supertest, Playwright |
| CI/CD | GitHub Actions → Azure App Service |

---

## Architecture

```
forms-ai/
├── shared/            @forms-ai/contracts — types and schemas used by both sides
├── backend/
│   └── src/
│       ├── domain/          entities, value objects, interfaces (no I/O)
│       ├── application/     use cases: auth, chat, drafts, publishing, sheets, google
│       ├── infrastructure/  Postgres/PGlite, Bedrock + rule-based AI, Google APIs, security
│       ├── presentation/    Express routes, controllers, validators, middleware
│       └── composition/     dependency wiring (ApplicationContainer)
├── frontend/
│   └── src/           pages, components (chat, artifact editor, sidebar, settings), state, services
├── tests/e2e/         Playwright journeys + an offline demo server
├── scripts/           database creation and migration copy helpers
└── .github/workflows/deploy.yml
```

**Request flow.** The browser talks to the Express API (in development via the Vite proxy on port 3000; in production the API serves the built frontend itself). A chat message goes to `SendChatMessageUseCase`, which classifies intent (create, modify, suggest, read sheet, …) with the AI provider, applies validated form operations to a new draft version, and returns the assistant reply. Publishing and sheet writes are separate endpoints triggered by buttons.

**Database migrations** live in `backend/src/infrastructure/database/migrations` and run automatically on server start.

---

## Setup

### Prerequisites

- **Node.js 24** (CI uses 24; Node 22 also works) and npm
- **Optional:** PostgreSQL 17 — not needed locally, PGlite is used instead
- **Optional:** a Google Cloud OAuth client — needed only to publish real forms and edit real sheets
- **Optional:** an Amazon Bedrock API key — without it the rule-based AI is used

### 1. Install

```bash
git clone https://github.com/rahulhansrajde/forms-ai.git
cd forms-ai
npm install
```

### 2. Create `.env` in the repository root

```bash
# Required
DATABASE_URL=pglite://.data/forms-ai          # embedded database stored in .data/
TOKEN_ENCRYPTION_KEY=<base64 32-byte key>     # generate below

# Local URLs (defaults shown)
PORT=5000
FRONTEND_ORIGIN=http://localhost:3000
GOOGLE_REDIRECT_URI=http://localhost:5000/auth/google/callback

# Optional — Google Forms & Sheets
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Optional — AI (leave empty to use the rule-based engine)
BEDROCK_API_KEY=
BEDROCK_REGION=ap-south-1
BEDROCK_MODELS=zai.glm-5
```

Generate the encryption key:

```bash
openssl rand -base64 32
# or
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`.env` is git-ignored. Never commit it.

### 3. Set up Google OAuth (optional)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Forms API** and **Google Sheets API**.
2. Configure the OAuth consent screen and add these scopes:
   `userinfo.email`, `userinfo.profile`, `forms.body`, `spreadsheets`.
   While the app is in *Testing* mode, add your Google account as a test user.
3. Create an **OAuth client ID** of type *Web application* with the authorized redirect URI
   `http://localhost:5000/auth/google/callback`
   (and your production URL + `/auth/google/callback` later).
4. Put the client ID and secret into `.env`.

### 4. Use PostgreSQL instead of PGlite (optional)

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/forms_ai
npm run db:create   # creates the database if missing
npm run migrate     # applies migrations (also runs automatically on start)
```

---

## Run guide

### Development (hot reload)

```bash
npm run dev
```

| Service | URL |
| --- | --- |
| Web app (Vite) | http://localhost:3000 |
| API | http://localhost:5000 |
| Health check | http://localhost:5000/health → `{"status":"ok"}` |

Open http://localhost:3000, sign up, and start chatting.

### Production build, run locally

```bash
npm run build
NODE_ENV=production \
FRONTEND_DIST_DIRECTORY=$PWD/frontend/dist \
FRONTEND_ORIGIN=http://localhost:5000 \
npm start
```

The API now serves the frontend too — open http://localhost:5000. In production mode cookies are `Secure`, so use HTTPS outside localhost.

### Offline demo mode (no Google or AI keys)

The Playwright demo server runs the full app with an in-memory database, the rule-based AI, and simulated Google Forms/Sheets (consent is skipped and sample spreadsheets are pre-seeded). It's ideal for demos and screenshots.

```bash
npm run build -w shared
npx tsx tests/e2e/support/e2e-server.ts            # terminal 1 — API on :5000
npm run build -w frontend && npm run preview -w frontend   # terminal 2 — web on :3000
```

Things to try in demo mode:

- `Create a college hackathon registration form.`
- `Use this Google Sheet: https://docs.google.com/spreadsheets/d/1StudentRegistrationE2E000000000000000000/edit`
- `Change Rahul's Year from 3rd Year to 4th Year.`

Data disappears when the demo server stops.

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API + web with hot reload |
| `npm run build` | Build shared, backend and frontend |
| `npm start` | Start the built backend |
| `npm run migrate` | Apply database migrations |
| `npm run db:create` | Create the Postgres databases named in `DATABASE_URL` / `TEST_DATABASE_URL` |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm test` | Unit + integration tests (backend and frontend) |
| `npm run test:postgres` | Backend integration tests against real Postgres |
| `npm run test:e2e` | Playwright browser journeys |
| `npm run verify` | typecheck + lint + test + build (what CI runs) |

---

## Usage

### Build a form

1. **Describe it** — on *New chat*, type e.g. `Create a feedback form for students.`
2. **Review** — click **Show preview** to open the draft panel. Edit any field directly; each edit is a new version (`v1`, `v2`, …, switchable with the version picker).
3. **Refine by chat**
   - `Remove phone number.`
   - `What else can I ask?` → then `Add those questions.` or `Add 1 and 3.`
   - `Start over with a shorter version.`
4. **Publish** — click **Create GForm**. The first time, you'll be asked to **Connect Google Forms** (OAuth). Confirm in the dialog and the chat shows **Open form**, **Open editor** and a QR code.

### Work with Google Sheets

| You type | What happens |
| --- | --- |
| `Create a spreadsheet called Event Leads with columns Name, Email, Phone` | A proposal card appears → click **Create Google Sheet** |
| `Use this Google Sheet: <sheet URL>` | Shows the sheet's name and tabs → click **Connect Google Sheet** |
| `Show me the first 5 rows` | Reads immediately and renders a table (reads need no button) |
| `What is Priya's department?` | Answers a single-record question |
| `Add a Phone Number column after Email` / `Clear column B` | A change card appears → **Apply changes** (destructive changes ask again) |
| `Change Rahul's Year from 3rd Year to 4th Year.` | Finds the record and prepares the update; asks for an ID if the name is ambiguous |

### Manage your workspace

- **Sidebar** — open past chats, start a new one, or delete a chat (5-second undo).
- **Theme** — light/dark toggle in the header.
- **Settings** — Profile, Security (change password), Google (permissions and disconnect), Preferences.

---

## Configuration reference

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` enables secure cookies |
| `PORT` | `5000` | API port |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | Public origin of the web app; used by the origin guard and redirects. In production set it to your site URL |
| `DATABASE_URL` | — (**required**) | `postgres://…`, `pglite://<dir>` or `pglite://memory` |
| `DATABASE_SSL` | `false` | `true` for managed Postgres (e.g. Azure) |
| `DATABASE_MAX_CONNECTIONS` | `10` | Postgres pool size |
| `SESSION_TTL_HOURS` | `168` | Session lifetime (7 days) |
| `TOKEN_ENCRYPTION_KEY` | — (**required**) | Base64 32-byte key for encrypting Google tokens. Keep it stable — changing it invalidates stored connections |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | empty | Enables Google Forms & Sheets |
| `GOOGLE_REDIRECT_URI` | `http://localhost:5000/auth/google/callback` | Must exactly match the OAuth client |
| `AI_PROVIDER` | auto | `bedrock` or `rule-based`; auto picks Bedrock when `BEDROCK_API_KEY` is set |
| `BEDROCK_API_KEY` | empty | Amazon Bedrock API key |
| `BEDROCK_REGION` | `ap-south-1` | AWS region |
| `BEDROCK_MODELS` | `zai.glm-5` | Comma-separated models, tried in order |
| `FRONTEND_DIST_DIRECTORY` | empty | Absolute path to `frontend/dist`; when set, the API serves the web app |
| `TRUST_PROXY` | `false` | `true` behind a reverse proxy/load balancer (Azure, Nginx) |
| `TEST_DATABASE_URL` | — | Postgres database for `npm run test:postgres`; its name must end in `_test` |

---

## Testing

```bash
npm test               # 567 unit + integration tests (backend 517, frontend 50)
npm run test:postgres  # needs TEST_DATABASE_URL=postgres://…/forms_ai_test
npx playwright install chromium   # once
npm run test:e2e       # browser journeys on desktop and mobile viewports
```

The Playwright suite starts the offline demo server and the frontend preview automatically. It covers signup/login, drafting, versioning, suggestions, OAuth, publishing and retry, sheet creation/linking/reading/updating, chat deletion, settings, and layout overflow checks from 320 px to 1440 px in both themes.

---

## Deployment

The app deploys as **one Node.js service**: the backend serves the API and the built frontend from the same origin.

### Azure App Service (CI/CD — what this repo uses)

`.github/workflows/deploy.yml` runs on every push to `main` (or manually):

1. **Validate** — `npm ci`, `npm run verify`, Postgres integration tests (Postgres 17 service container), Playwright e2e.
2. **Package** — assembles `shared`, `backend` and `frontend` builds with production dependencies into `forms-ai-release.zip`.
3. **Deploy** — signs in to Azure with OpenID Connect and deploys the zip to the `Forms-AI` web app (Production slot).

**One-time Azure setup**

1. **PostgreSQL** — create an *Azure Database for PostgreSQL – Flexible Server* (v17), a database such as `forms_ai`, and allow access from App Service.
2. **Web App** — create a Linux App Service, runtime **Node 24 LTS**, named `Forms-AI` (or change `AZURE_WEBAPP_NAME` in the workflow).
3. **Startup command** — *Configuration → General settings*: `npm start`
4. **Application settings** (*Configuration → Environment variables*):

   ```
   NODE_ENV=production
   DATABASE_URL=postgres://<user>:<password>@<server>.postgres.database.azure.com:5432/forms_ai
   DATABASE_SSL=true
   TOKEN_ENCRYPTION_KEY=<base64 32-byte key>
   FRONTEND_ORIGIN=https://<your-app>.azurewebsites.net
   FRONTEND_DIST_DIRECTORY=/home/site/wwwroot/frontend/dist
   GOOGLE_CLIENT_ID=…
   GOOGLE_CLIENT_SECRET=…
   GOOGLE_REDIRECT_URI=https://<your-app>.azurewebsites.net/auth/google/callback
   BEDROCK_API_KEY=…            # optional
   TRUST_PROXY=true
   SCM_DO_BUILD_DURING_DEPLOYMENT=false
   ```

   App Service provides `PORT` automatically.
5. **GitHub ↔ Azure** — in the Web App's *Deployment Center*, connect the GitHub repo with **user-assigned identity / OIDC**. This creates the `AZUREAPPSERVICE_CLIENTID_…`, `AZUREAPPSERVICE_TENANTID_…` and `AZUREAPPSERVICE_SUBSCRIPTIONID_…` repository secrets the workflow references. If you create your own federated credential instead, add those three secrets and update their names in `deploy.yml`.
6. **Google OAuth** — add the production redirect URI to the OAuth client and publish the consent screen (or add test users).
7. **Push to `main`** and watch the *Actions* tab. Verify with `https://<your-app>.azurewebsites.net/health`.

Migrations run automatically on startup.

### Any other Node host (VM, Render, Railway, Docker)

```bash
npm ci
npm run build
NODE_ENV=production \
DATABASE_URL=postgres://… DATABASE_SSL=true \
TOKEN_ENCRYPTION_KEY=… \
FRONTEND_ORIGIN=https://forms.example.com \
FRONTEND_DIST_DIRECTORY=$PWD/frontend/dist \
GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… \
GOOGLE_REDIRECT_URI=https://forms.example.com/auth/google/callback \
TRUST_PROXY=true \
npm start
```

Put it behind HTTPS (secure cookies require it) and point a health check at `/health`.

### Production checklist

- [ ] HTTPS in front of the app; `TRUST_PROXY=true` behind a proxy
- [ ] `FRONTEND_ORIGIN` exactly matches the public URL (no trailing slash)
- [ ] `GOOGLE_REDIRECT_URI` registered in Google Cloud
- [ ] `TOKEN_ENCRYPTION_KEY` stored as a secret and backed up
- [ ] `DATABASE_SSL=true` for managed Postgres
- [ ] `/health` returns `{"status":"ok"}`

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Invalid configuration. DATABASE_URL: …` on start | `.env` is missing or not in the repository root |
| `TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key` | Regenerate with `openssl rand -base64 32` |
| `Port 3000 is already in use` | Vite uses a strict port; stop the other process |
| Requests rejected as cross-origin / login doesn't stick | `FRONTEND_ORIGIN` doesn't match the URL in the browser; in production also check HTTPS and `TRUST_PROXY` |
| Google `redirect_uri_mismatch` | `GOOGLE_REDIRECT_URI` must match the OAuth client exactly |
| Google `access_denied` | Add your account as a test user on the consent screen |
| "Google Forms connection is not configured on this server." | Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` and restart |
| Replies feel template-like | No `BEDROCK_API_KEY`, so the rule-based engine is active — that's expected |
| Blank page in production | `FRONTEND_DIST_DIRECTORY` doesn't point at a folder containing `index.html` |

---

## License

Released under the [MIT License](LICENSE).
