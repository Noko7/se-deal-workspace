import { NextResponse } from "next/server";
import { createUser, emailExists, fieldErrorsFrom, signupSchema } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, sessionCookieOptions } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, fieldErrors: fieldErrorsFrom(parsed.error) }, { status: 400 });
  }

  const { name, email, password } = parsed.data;

  if (await emailExists(email)) {
    return NextResponse.json(
      { ok: false, fieldErrors: { email: "An account with this email already exists." } },
      { status: 409 },
    );
  }

  const user = await createUser({ name, email, password });
  const token = createSessionToken({ sub: user.id, email: user.email, name: user.name });

  const response = NextResponse.json({ ok: true, user: { email: user.email, name: user.name } });
  response.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions(), maxAge: SESSION_MAX_AGE });
  return response;
}
