import { NextResponse } from "next/server";
import { emailExists, emailSchema } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Step 1 of the login flow ("Continue"): does an account exist for this email?
// Used to decide whether to show the password field or nudge toward signup.
export async function POST(request: Request) {
  let body: { email?: unknown };
  try {
    body = (await request.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const parsed = emailSchema.safeParse(body.email);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid email." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, email: parsed.data, exists: await emailExists(parsed.data) });
}
