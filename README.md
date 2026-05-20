## SE Deal Workspace

Foundation-first implementation of the Nutanix SE Deal Workspace plan:

- 5-page app shell:
  - Calendar
  - Current Deals
  - Email Memory
  - Integrations
  - QBR Deck Builder
- Prisma + SQLite data layer with seeded baseline records
- Upload + preview flow for presentation/whiteboard/deal artifacts
- Internal AI sizing recommendation workflow with approval state
- Integration adapter layer with mock/live connector stubs for Wave 2
- Local and Docker runtime profiles

## Getting Started

### Local setup

1) Install dependencies:

```bash
npm install
```

2) Prepare local database:

```bash
npm run db:push
npm run db:seed
```

3) Start development server:

```bash
npm run dev
```

4) Open [http://localhost:3000](http://localhost:3000)

### Useful commands

```bash
npm run lint
npm run build
npm run db:generate
npm run db:reset
```

### Environment variables

Copy `.env.example` to `.env` and fill in connector values as needed for Wave 2:

- `OUTLOOK_TENANT_ID`
- `OUTLOOK_CLIENT_ID`
- `SALESFORCE_INSTANCE_URL`
- `SALESFORCE_CLIENT_ID`
- `LUCIDCHART_API_KEY`

### Health checks

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
  - `backup-db.sh`
  - `restore-db.sh`
  - `systemd/se-deal-workspace.service`
