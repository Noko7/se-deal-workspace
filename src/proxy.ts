import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// App-wide auth gate. Replaces the old HTTP Basic Auth with a session-cookie
// login flow. Proxy runs on the Node.js runtime, so it can verify the signed
// session cookie (HMAC) without a database round-trip.

// Pages reachable without a session.
const PUBLIC_PAGES = new Set(["/login", "/signup"]);
// API routes reachable without a session (the auth endpoints + health probe).
// Inbound webhooks (e.g. Zoom) are external machine-to-machine callers with no
// session cookie; they authenticate via their own signed-payload verification.
const PUBLIC_APIS = new Set([
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/check-email",
  "/api/auth/logout",
  "/api/health",
  "/api/integrations/zoom/webhook",
]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  // Always allow the public auth/health APIs.
  if (PUBLIC_APIS.has(pathname)) {
    return NextResponse.next();
  }

  const isPublicPage = PUBLIC_PAGES.has(pathname);

  if (session) {
    // Signed-in users shouldn't sit on the login/signup screens.
    if (isPublicPage) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Unauthenticated from here on.
  if (isPublicPage) {
    return NextResponse.next();
  }

  // API calls get a clean 401 rather than an HTML redirect.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Everything else redirects to login, preserving the intended destination.
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", pathname);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except Next internals and static assets (so the login
  // page's images/fonts/styles load without a session).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map|txt|woff|woff2|ttf|pmtiles|json)$).*)",
  ],
};
