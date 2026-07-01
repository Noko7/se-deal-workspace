import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { createArtifact, createNote } from "@/lib/data";
import { sanitizeField } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

type AssetType =
  | "PRESENTATION"
  | "COLLECTOR"
  | "RV_TOOL"
  | "ZIP_BUNDLE"
  | "WHITEBOARD"
  | "TEXT_BRIEF"
  | "QBR_REPORT";

// Map a dropped file's extension to a first-class asset type so it lands in the
// right brain bucket. Falls back to a generic text brief.
function assetTypeFor(name: string): AssetType {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["ppt", "pptx", "key"].includes(ext)) return "PRESENTATION";
  if (["csv"].includes(ext)) return "COLLECTOR";
  if (["xls", "xlsx"].includes(ext)) return "RV_TOOL";
  if (["zip", "gz", "tar", "7z"].includes(ext)) return "ZIP_BUNDLE";
  return "TEXT_BRIEF";
}

// Text-like files are also ingested as a note so the AI can read the content,
// not just see a filename.
const TEXT_EXT = new Set(["txt", "md", "markdown", "csv", "log", "json", "yaml", "yml"]);

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per file guardrail.

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a multipart upload." }, { status: 400 });
  }

  const dealId = sanitizeField(form.get("dealId"), 64);
  if (!dealId) {
    return NextResponse.json({ ok: false, error: "Missing account id." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, error: "No file provided." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "File is larger than 15 MB." }, { status: 413 });
  }

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true, aiOptOut: true },
  });
  if (!deal) {
    return NextResponse.json({ ok: false, error: "Account not found." }, { status: 404 });
  }
  if (deal.aiOptOut) {
    return NextResponse.json(
      { ok: false, error: "This account has opted out of AI usage." },
      { status: 403 },
    );
  }

  const fileName = file.name || "upload";
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  try {
    await createArtifact({
      dealId,
      type: assetTypeFor(fileName),
      sourceTool: "Upload",
      title: fileName,
      uri: `uploaded://${encodeURIComponent(fileName)}`,
      uploadedBy: "se.workspace@nutanix.com",
    });

    // For text-like files, capture the content as a note so the AI can reason
    // over it. Binary files (decks, archives) land as an asset reference only.
    if (TEXT_EXT.has(ext)) {
      const text = (await file.text()).trim();
      if (text) {
        const clipped = text.length > 8000 ? `${text.slice(0, 8000)}\n…[truncated]` : text;
        await createNote({
          dealId,
          role: "SE",
          author: "se.workspace@nutanix.com",
          body: `Uploaded file: ${fileName}\n\n${clipped}`,
        });
      }
    }

    revalidatePath(`/accounts/${dealId}`);
    revalidatePath("/");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: (error as Error).message }, { status: 500 });
  }
}
