import { NextResponse } from "next/server";
import { parseSizerWorkbook, type SizerSource } from "@/lib/simple-sizer";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 30 * 1024 * 1024;

function asSource(value: unknown): SizerSource {
  if (value === "collector_excel" || value === "rvtools" || value === "liveoptics") return value;
  return "collector_excel";
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid multipart form payload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Upload a Collector/RVTools Excel file." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ ok: false, error: "Uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ ok: false, error: "File too large. Maximum size is 30 MB." }, { status: 400 });
  }

  const source = asSource(form.get("source"));
  const name = file.name.toLowerCase();
  if (name.endsWith(".zip")) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Raw collector ZIP is not supported here. Upload the Excel export generated after importing ZIP into Nutanix Collector.",
      },
      { status: 400 },
    );
  }
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    return NextResponse.json({ ok: false, error: "Only .xlsx/.xls files are supported." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseSizerWorkbook(buffer, source, file.name);
    return NextResponse.json({ ok: true, parsed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error";
    return NextResponse.json(
      { ok: false, error: `Could not parse file: ${message}` },
      { status: 400 },
    );
  }
}

