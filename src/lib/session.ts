// Stateless, signed session cookie. The token is `<payload>.<signature>` where
// payload is base64url(JSON) and signature is an HMAC-SHA256 over the payload.
// Because verification needs only the shared secret (no DB), it can run in
// proxy.ts (Node.js runtime) on every request without a database round-trip.
//
// This is a pragmatic dev-environment session. For production you'd typically
// use a vetted auth library and/or server-side session store.

import crypto from "node:crypto";

export const SESSION_COOKIE = "se_session";

// 7 days, in seconds.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type SessionPayload = {
  /** User id. */
  sub: string;
  email: string;
  name: string;
  /** Expiry, epoch seconds. */
  exp: number;
};

function getSecret(): string {
  // A stable dev default keeps logins working out of the box; override in any
  // real deployment with AUTH_SECRET.
  return process.env.AUTH_SECRET?.trim() || "se-deal-workspace-dev-secret-change-me";
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
}

export function createSessionToken(input: { sub: string; email: string; name: string }): string {
  const payload: SessionPayload = {
    sub: input.sub,
    email: input.email,
    name: input.name,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const payloadB64 = base64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token) {
    return null;
  }
  const dot = token.indexOf(".");
  if (dot === -1) {
    return null;
  }
  const payloadB64 = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = sign(payloadB64);

  // Constant-time comparison; lengths must match for timingSafeEqual.
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (!payload.sub || !payload.email) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// Cookie attributes shared by login/signup (set) and logout (clear). `secure`
// is opt-in via env so the cookie still works over plain http in local dev.
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: /^(1|true|yes)$/i.test((process.env.AUTH_COOKIE_SECURE ?? "").trim()),
  };
}
