# SE Deal Workspace — Expansion Plan

Goal: make the SE Deal Workspace the single, simple, comprehensive place for an
SE to run deals, accounts, and ops. "Stupid is better" — minimal, focused UI; no
unnecessary components or data.

All external integrations (Zoom, Salesforce) are built as **scaffolds with clean
seams**: full UI + local persistence + adapter boundaries that light up when live
Wave 2 credentials are supplied. No live external API calls are made today.

Deployment note: in this workspace the app runs via the dev server (hot reload).
`deploy.sh` targets the production VM's systemd unit and is not used here. Schema
changes use `prisma db push` + `prisma generate` (no migrations dir).

Each chunk = its own `feat/...` branch → merge `--no-ff` into `main` → push origin.

---

## Chunk 1 — Account Map: filters + Salesforce data-source seam
- Remove the **State** filter from the map filter panel.
- Add a **search box** (account name / AE / SE / city) to the filter panel.
- Add a documented **Salesforce account data-source seam** in `lib/account-map.ts`:
  when `ACCOUNT_MAP_SOURCE_URL` (and optional auth) is set, fetch live account
  JSON/CSV from that endpoint; otherwise fall back to the existing CSV files.
  This is the production path to auto-updating from the live Salesforce account
  list with no code change once the endpoint exists.

## Chunk 2 — Zoom integration (Integrations page)
- Schema: `ZoomConfig` singleton (enabled + auto-attach toggles for notes,
  summary, transcript) and `MeetingTranscript` model (meeting/deal scoped:
  summary, transcript, notes, source, autoIngestedAt).
- Integrations page: a **Zoom** section to configure the connector and the three
  auto-attach toggles, with copy explaining it feeds **Account AI** and the
  **Note Formatter**.
- `zoom` adapter + connector seam + seed record.
- Ingestion seam: when a Zoom meeting ends, notes/summary/transcript are attached
  to the matching meeting and exposed to Account AI + Note Formatter. Today this
  is a documented seam + manual "pull" path (no live Zoom credentials).

## Chunk 3 — Calendar → Salesforce Task (Helper replacement)
- Schema: `SalesforceTask` model with the exact Helper fields: taskName,
  description, assignee, relatedAccount, products[], type, status, dueDate,
  durationHrs, contact, priority, remind, plus sync status.
- Meeting drawer: **Log Salesforce Task** action → form prefilled from the
  meeting (task name from subject, account from deal, contact from attendees,
  due date from meeting date). Saved locally with a mock "Send to Salesforce"
  status, ready for the live SF API.
- Products multi-select set: AHV, NAI, NCI, NCI Data, NCM, NDB, NKP, NUS,
  NC2-AWS, NC2-Azure, NC2-GCP, DRaaS, EUC, NUS.

## Chunk 4 — Opportunity detail (Helper Opportunities replacement)
- Extend the deal record with opportunity fields (services ACV, ACV amount,
  forecast category, portfolio, products, key contacts, owners/team, why now,
  why nutanix, channel notes, technical close date, next steps).
- Opportunity **detail page** opened from Current Deals, with tabbed sections
  (Details / Activities / Notes / Contacts / Attachments) — kept simple.
- "Recent Notes" auto-pulls from Zoom transcripts + AI summaries (Chunk 2),
  giving the SE one place to update notes from meeting assets.
