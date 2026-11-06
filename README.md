## SE Deal Workspace

A local, stateless toolkit for Nutanix systems engineers — no database, no
login, no persisted customer or account data. Every tool operates on a file
you upload or a scenario you paste in, and produces a downloadable output.

- Note Formatter — turn raw notes into implementation plans
- Simple Sizer — import Collector/RVTools and size quickly
- QBR Deck Builder — pull a CS360 health report and assemble a QBR deck
- Install Base Report — merge CS360 exports into a color-coded workbook
- Proposal Builder — turn a Sizer scenario into a branded proposal + BOM
- Integrations — connector setup/status and the Salesforce schema reference

Admin config (connector status, LLM credentials) is stored locally in
`data/local-config.json`, encrypted at rest — not in a database.

## Getting Started

### Local setup

1) Install dependencies:

```bash
npm install
```

2) Start the development server:

```bash
npm run dev
```

3) Open [http://localhost:3000](http://localhost:3000)

### Useful commands

```bash
npm run lint
npm run build
npm test
```

### Environment variables

Copy `.env.example` to `.env`. Everything is optional:

- `APP_SECRET` — encrypts locally stored admin config at rest
- `LLM_*` — points the Note Formatter at an OpenAI-compatible endpoint (works offline without it)

### Health check

- App health: `GET /api/health`
- Connector scaffold status: `GET /api/connectors`

### Docker runtime

```bash
docker compose up --build
```

### Nutanix VM deployment

- Runbook: `docs/nutanix-vm-deployment.md`
- Automation scripts: `deploy/nutanix/`
  - `bootstrap-ubuntu.sh`
  - `deploy.sh`
  - `validate.sh`
  - `systemd/se-deal-workspace.service`
