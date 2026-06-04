import { NextResponse } from "next/server";
import { parseSizerWorkbook, type SizerSource } from "@/lib/simple-sizer";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 30 * 1024 * 1024;

function asSource(value: unknown): SizerSource {
  return value === "rvtools" ? "rvtools" : "collector";
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Upload a Collector/RVTools Excel file." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ ok: false, error: "File too large. Maximum size is 30 MB." }, { status: 400 });
  }

  const source = asSource(form.get("source"));
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    return NextResponse.json({ ok: false, error: "Only .xlsx/.xls files are supported." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseSizerWorkbook(buffer, source, file.name);
    return NextResponse.json({ ok: true, parsed });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: `Could not parse file: ${(error as Error).message}` },
      { status: 400 },
    );
  }
}

