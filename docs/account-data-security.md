# Account Map data — where the sensitive files live

The Account Map combines **two** CSVs per environment (a primary account-map file
and a billing "account-map2" file). The app exposes two environments, chosen from
the in-app environment switcher:

| Environment | Files | Committed to git? | Sensitive? |
| --- | --- | --- | --- |
| Foundation (default) | `public/data/account-map-dummy.csv` + `public/data/account-map2-dummy.csv` | Yes | No — fabricated dummy data |
| **Dev** | **`/etc/se-deal-workspace/account-map.csv`** + **`/etc/se-deal-workspace/account-map2.csv`** | **No — never** | **Yes** |

> The real files are read **server-side only** (`src/lib/account-map.ts`) and are
> intentionally **not** under `public/`, so they are never served as downloadable
> static assets.

## How the paths are selected

`src/lib/account-map.ts` (`resolveFilesForEnvironment`) picks files by environment:

- **Foundation** -> the bundled samples in `public/data/` (no config).
- **Dev** -> reads `account-map.csv` and `account-map2.csv` from the directory in
  the `ACCOUNT_DATA_DIR` environment variable. If `ACCOUNT_DATA_DIR` is unset it
  defaults to `/etc/se-deal-workspace`.

A missing `account-map2.csv` is tolerated (the loader uses whatever files exist),
but at least one file must be present for the "Dev" environment or the page errors.

## Production setup (do this on the server, once)

1. Create the directory and place the real CSVs (same headers as the samples):

   ```bash
   sudo mkdir -p /etc/se-deal-workspace
   sudo cp account-map.csv account-map2.csv /etc/se-deal-workspace/
   ```

2. Lock down permissions so only the app's service account can read them:

   ```bash
   # replace "appuser" with the user the Next.js server runs as
   sudo chown appuser:appuser /etc/se-deal-workspace/account-map.csv /etc/se-deal-workspace/account-map2.csv
   sudo chmod 600 /etc/se-deal-workspace/account-map.csv /etc/se-deal-workspace/account-map2.csv
   ```

3. (Optional) If the files live somewhere other than `/etc/se-deal-workspace`,
   point the app at the directory via env (systemd unit, Docker env, or `.env`):

   ```bash
   ACCOUNT_DATA_DIR=/etc/se-deal-workspace
   ```

4. Restart the app, then select the **Dev** environment in the switcher.

### Docker / mounted deployments

Mount the files at runtime instead of baking them into the image (a baked-in layer
is another copy that can leak):

```bash
docker run \
  -e ACCOUNT_DATA_DIR=/etc/se-deal-workspace \
  -v /etc/se-deal-workspace/account-map.csv:/etc/se-deal-workspace/account-map.csv:ro \
  -v /etc/se-deal-workspace/account-map2.csv:/etc/se-deal-workspace/account-map2.csv:ro \
  ...
```

## Guardrails

- `.gitignore` blocks `/data/*.csv` (except the sample) and `/secure-data/`, so a real file dropped into the repo will not be committed by accident.
- The real file lives outside the repo entirely (`/etc/...`), so it is not in any working tree or image layer.
- **The app still hands account data to the browser when the page renders**, so this file protection must be paired with authentication on the app (see the Basic Auth proxy). Without auth, anyone who can load the page can see the data.

## Where this is referenced

- Loader / path resolution: `src/lib/account-map.ts` (`resolveFilesForEnvironment`)
- Environments / switcher: `src/lib/environment.ts`, `src/components/environment-switcher.tsx`
- Env template: `.env.example` (`ACCOUNT_DATA_DIR`)
