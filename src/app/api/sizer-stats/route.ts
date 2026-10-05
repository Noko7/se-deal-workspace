import { NextResponse } from "next/server";
import { z } from "zod";
import { addSizerStats, readSizerStats } from "@/lib/sizer-stats-store";

// Global Simple Sizer totals. Counts only; see lib/sizer-stats-store.ts.
export const dynamic = "force-dynamic";

// Bounded per call so one request cannot skew the board.
const Delta = z
  .object({
    vms: z.number().int().min(0).max(200_000).default(0),
    clusters: z.number().int().min(0).max(10_000).default(0),
    solutions: z.number().int().min(0).max(1).default(0),
  })
  .strict();

export async function GET() {
  return NextResponse.json(await readSizerStats(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const parsed = Delta.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid counter update." }, { status: 400 });
  return NextResponse.json(await addSizerStats(parsed.data), { headers: { "Cache-Control": "no-store" } });
}
