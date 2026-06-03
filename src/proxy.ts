import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// App-wide HTTP Basic Auth. In this Next.js version the "middleware" file
// convention was renamed to "proxy" (proxy.ts, exported `proxy`), and it runs
// on the Node.js runtime by default, so `Buffer` is available here.

const REALM = "SE Deal Workspace";

// User list. Override in production with the BASIC_AUTH_USERS env var, formatted
// as "user1:pass1,user2:pass2". The defaults below let the app work out of the
// box for this internal tool; rotate credentials by editing the env var.
const DEFAULT_USERS = "admin:admin,ed:SLEDSoutheast";

function loadUsers(): Map<string, string> {
  const raw = process.env.BASIC_AUTH_USERS?.trim() || DEFAULT_USERS;
  const users = new Map<string, string>();
  for (const pair of raw.split(",")) {
    const sep = pair.indexOf(":");
    if (sep === -1) {
      continue;
    }
    const user = pair.slice(0, sep).trim();
    const pass = pair.slice(sep + 1);
    if (user) {
      users.set(user, pass);
    }
  }
  return users;
}

const USERS = loadUsers();

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

// Length-checked, constant-time comparison to avoid trivial timing leaks.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function proxy(request: NextRequest) {
  // Allow infra/health probes through without credentials.
  if (request.nextUrl.pathname === "/api/health") {
    return NextResponse.next();
  }

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const sep = decoded.indexOf(":");
    if (sep !== -1) {
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      const expected = USERS.get(user);
      if (expected !== undefined && safeEqual(pass, expected)) {
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
