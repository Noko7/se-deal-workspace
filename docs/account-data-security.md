# Account Map data — where the sensitive file lives

The Account Map reads customer data from a CSV. There are two distinct files:

| Purpose | Path | Committed to git? | Sensitive? |
| --- | --- | --- | --- |
| Local dev / demo sample | `data/account-map-sample.csv` (in repo) | Yes | No — fabricated dummy data |
| **Real production data** | **`/etc/se-deal-workspace/accounts.csv`** | **No — never** | **Yes** |

> The data file is read **server-side only** (`src/lib/account-map.ts`) and is intentionally **not** under `public/`, so it is never served as a downloadable static asset.

## How the path is selected

`src/lib/account-map.ts` resolves the file from the `ACCOUNT_DATA_FILE` environment variable. If it is unset, it falls back to the bundled sample:

- `ACCOUNT_DATA_FILE` set  -> reads that file (absolute path recommended)
- `ACCOUNT_DATA_FILE` unset -> reads `data/account-map-sample.csv`

## Production setup (do this on the server, once)

1. Create the directory and place the real CSV (same headers as the sample):

   ```bash
   sudo mkdir -p /etc/se-deal-workspace
   sudo cp accounts.csv /etc/se-deal-workspace/accounts.csv
   ```

2. Lock down permissions so only the app's service account can read it:

   ```bash
   # replace "appuser" with the user the Next.js server runs as
   sudo chown appuser:appuser /etc/se-deal-workspace/accounts.csv
   sudo chmod 600 /etc/se-deal-workspace/accounts.csv
   ```

3. Point the app at it via env (e.g. in the systemd unit, Docker env, or `.env`):

   ```bash
   ACCOUNT_DATA_FILE=/etc/se-deal-workspace/accounts.csv
   ```

4. Restart the app.

### Docker / mounted deployments

Mount the file at runtime instead of baking it into the image (a baked-in layer is another copy that can leak):

```bash
docker run \
  -e ACCOUNT_DATA_FILE=/etc/se-deal-workspace/accounts.csv \
  -v /etc/se-deal-workspace/accounts.csv:/etc/se-deal-workspace/accounts.csv:ro \
  ...
```

## Guardrails

- `.gitignore` blocks `/data/*.csv` (except the sample) and `/secure-data/`, so a real file dropped into the repo will not be committed by accident.
- The real file lives outside the repo entirely (`/etc/...`), so it is not in any working tree or image layer.
- **The app still hands account data to the browser when the page renders**, so this file protection must be paired with authentication on the app (see the Basic Auth proxy). Without auth, anyone who can load the page can see the data.

## Where this is referenced

- Loader / path resolution: `src/lib/account-map.ts`
- Env template: `.env.example` (`ACCOUNT_DATA_FILE`)
