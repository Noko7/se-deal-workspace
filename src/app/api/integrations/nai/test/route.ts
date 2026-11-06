import { NextResponse } from "next/server";
import { runLlmConnectionDiagnostics } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const diagnostics = await runLlmConnectionDiagnostics();
    return NextResponse.json(diagnostics, { status: diagnostics.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        model: null,
        baseUrl: null,
        insecureTls: false,
        steps: [
          {
            step: "NAI diagnostics",
            ok: false,
            detail: `Unexpected error while testing NAI connection: ${(error as Error).message}`,
          },
        ],
      },
      { status: 500 },
    );
  }
}
