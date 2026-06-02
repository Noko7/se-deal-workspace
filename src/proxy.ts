import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// HTTP Basic Auth for the whole app. This Next version renamed the
// "middleware" file convention to "proxy" (proxy.ts, exported `proxy`).
// Runs on the Node.js runtime, so Buffer is available.

const REALM = "SE Deal Workspace";

function unauthorized() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

// Length-independent constant-time-ish comparison to avoid leaking match
// progress via timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function proxy(request: NextRequest) {
  // Allow infra/health probes through without credentials.
  if (request.nextUrl.pathname === "/api/health") {
    return NextResponse.next();
  }

  const expectedUser = process.env.BASIC_AUTH_USER;
  const expectedPass = process.env.BASIC_AUTH_PASSWORD;

  // Fail closed: if credentials are not configured, deny everything rather
  // than accidentally exposing sensitive customer data.
  if (!expectedUser || !expectedPass) {
    return new NextResponse(
      "Authentication is not configured. Set BASIC_AUTH_USER and BASIC_AUTH_PASSWORD.",
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep !== -1) {
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      if (safeEqual(user, expectedUser) && safeEqual(pass, expectedPass)) {
        return NextResponse.next();
      }
    }
  }

  return unauthorized();
}

export const config = {
  // Protect everything except Next's static assets and the favicon. API routes
  // are intentionally included (health is allowed inside the function above).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
