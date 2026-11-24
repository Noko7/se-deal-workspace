import { execFile } from "node:child_process";
import { createHash, X509Certificate } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

// Wrapper installed by scripts/setup-pdf-chrome.sh (sets LD_LIBRARY_PATH and fonts).
const CHROME = process.env.PDF_CHROME_BIN || path.join(homedir(), ".local/share/pdf-chrome/chrome");
const RENDER_TIMEOUT_MS = 60_000;

export class PdfRendererUnavailableError extends Error {}

export async function pdfRendererAvailable(): Promise<boolean> {
  try {
    await access(CHROME, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Renders a complete HTML document to PDF with headless Chrome. Page size and
 * margins come from the document's CSS `@page` rules; the browser's own
 * header/footer (URL, date, title) is never drawn.
 *
 * Only `allowHosts` resolve, so the document can pull its stylesheets, images
 * and fonts but cannot reach anything else. Block scripts with a CSP <meta> in
 * the document: `--blink-settings=scriptEnabled=false` makes print-to-pdf
 * silently write nothing.
 *
 * `trustCertFile` pins one certificate (by public key) that Chrome accepts even
 * though it doesn't chain to a public CA or name 127.0.0.1 -- the app's own TLS
 * certificate. Without it every stylesheet and image request fails the TLS
 * handshake and the PDF prints as unstyled HTML.
 */
export async function renderHtmlToPdf(html: string, allowHosts: string[], trustCertFile?: string): Promise<Buffer> {
  if (!(await pdfRendererAvailable())) {
    throw new PdfRendererUnavailableError(`PDF renderer not installed at ${CHROME}. Run scripts/setup-pdf-chrome.sh.`);
  }
  const trustFlags = trustCertFile ? [`--ignore-certificate-errors-spki-list=${await spkiHash(trustCertFile)}`] : [];
  const dir = await mkdtemp(path.join(tmpdir(), "proposal-pdf-"));
  try {
    const htmlPath = path.join(dir, "doc.html");
    const pdfPath = path.join(dir, "doc.pdf");
    await writeFile(htmlPath, html, "utf8");
    const hostRules = ["MAP * ~NOTFOUND", ...allowHosts.map((h) => `EXCLUDE ${h}`)].join(", ");
    await new Promise<void>((resolve, reject) => {
      execFile(
        CHROME,
        [
          "--no-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--hide-scrollbars",
          "--no-first-run",
          "--mute-audio",
          `--user-data-dir=${path.join(dir, "profile")}`,
          `--host-resolver-rules=${hostRules}`,
          ...trustFlags,
          "--run-all-compositor-stages-before-draw",
          // Virtual time only advances once pending loads (CSS, fonts, images) settle.
          "--virtual-time-budget=15000",
          "--no-pdf-header-footer",
          "--generate-pdf-document-outline",
          `--print-to-pdf=${pdfPath}`,
          `file://${htmlPath}`,
        ],
        { timeout: RENDER_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
        (err, _stdout, stderr) => (err ? reject(new Error(`Chrome failed: ${err.message}\n${stderr.slice(-2000)}`)) : resolve()),
      );
    });
    return await readFile(pdfPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// Base64 SHA-256 of the certificate's SubjectPublicKeyInfo, the form Chrome's
// --ignore-certificate-errors-spki-list expects.
async function spkiHash(certFile: string): Promise<string> {
  const cert = new X509Certificate(await readFile(certFile));
  const spki = cert.publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(spki).digest("base64");
}
