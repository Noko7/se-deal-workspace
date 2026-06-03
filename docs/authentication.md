# Authentication (HTTP Basic Auth)

The whole app is gated behind HTTP Basic Auth, enforced in `src/proxy.ts`
(this Next version's renamed `middleware` convention). It's intended for
internal network users.

## How it works

- Every request is challenged for a username/password except:
  - Next static assets (`_next/static`, `_next/image`, `favicon.ico`) — excluded via the matcher
  - `GET /api/health` — allowed through so infra health probes keep working
- Credentials come from environment variables:
  - `BASIC_AUTH_USER`
  - `BASIC_AUTH_PASSWORD`
- **Fail-closed:** if those env vars are not set, the app returns `503` for
  everything instead of serving data unprotected.

## Setup

Add to your environment (e.g. `.env`, systemd unit, or Docker env):

```bash
BASIC_AUTH_USER=yourteam
BASIC_AUTH_PASSWORD=a-long-shared-secret
```

Restart the app. Browsers will prompt for the username/password on first visit
and remember it for the session.

## Recommendations

- **Serve over HTTPS.** Basic Auth sends credentials base64-encoded (not
  encrypted), so TLS is required to keep them safe in transit.
- Rotate the shared password periodically and treat it as a secret (don't
  commit it).
- This is a shared credential. If you later need per-user accounts or audit
  logging, upgrade to a session/identity-based scheme.

## Files

- Enforcement: `src/proxy.ts`
- Env vars: `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`
