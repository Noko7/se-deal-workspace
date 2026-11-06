import { NextResponse } from "next/server";
import { PdfRendererUnavailableError, renderHtmlToPdf } from "@/lib/pdf-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The brief embeds the uploaded customer logo as a data URL, so allow headroom.
const MAX_HTML_LENGTH = 25 * 1024 * 1024;
const MONTSERRAT =
  "https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,600&display=block";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

type PdfBody = { html?: unknown; stylesheets?: unknown; title?: unknown };

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// Only the markup is needed; anything that could run code, navigate, frame
// another page or re-point the base URL is dropped.
function stripActiveContent(html: string) {
  return html
    .replace(/<(script|style|iframe|frame|frameset|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(script|iframe|frame|frameset|object|embed|link|meta|base)\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}

function safeFilename(title: string) {
  const name = title.replace(/[^\w\s.,()&'-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return `${name || "Solution Proposal"}.pdf`;
}

export async function POST(request: Request) {
  let body: PdfBody;
  try {
    body = (await request.json()) as PdfBody;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const html = typeof body.html === "string" ? body.html : "";
  if (!html.trim()) return NextResponse.json({ error: "Nothing to render." }, { status: 400 });
  if (html.length > MAX_HTML_LENGTH) return NextResponse.json({ error: "The document is too large to render." }, { status: 413 });
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Solution Proposal";
  const stylesheets = (Array.isArray(body.stylesheets) ? body.stylesheets : [])
    .filter((s): s is string => typeof s === "string" && /^\/_next\/static\/(?!.*\.\.)[\w\-.~/]+\.css$/.test(s))
    .slice(0, 50);

  // Chrome loads the app's own CSS and images back from this server.
  const port = process.env.PORT || "3000";
  const origin = `http://127.0.0.1:${port}/`;
  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none'; frame-src 'none'">
<title>${escapeHtml(title)}</title>
<base href="${origin}">
<link rel="stylesheet" href="${MONTSERRAT}">
${stylesheets.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join("\n")}
</head>
<body>${stripActiveContent(html)}</body>
</html>`;

  try {
    const pdf = await renderHtmlToPdf(doc, ["127.0.0.1", ...FONT_HOSTS]);
    const filename = safeFilename(title);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof PdfRendererUnavailableError) {
      return NextResponse.json({ error: "PDF export isn't set up on this server yet. Run scripts/setup-pdf-chrome.sh." }, { status: 503 });
    }
    console.error("[proposal-pdf]", e);
    return NextResponse.json({ error: "The PDF could not be generated. Try again." }, { status: 500 });
  }
}
