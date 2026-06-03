import { NextResponse } from "next/server";
import { fieldErrorsFrom, findUserByEmail, loginSchema, verifyPassword } from "@/lib/auth";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, sessionCookieOptions } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, fieldErrors: fieldErrorsFrom(parsed.error) }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const user = await findUserByEmail(email);

  // Same generic error whether the email is unknown or the password is wrong,
  // so we don't reveal which emails are registered.
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ ok: false, error: "Incorrect email or password." }, { status: 401 });
  }

  const token = createSessionToken({ sub: user.id, email: user.email, name: user.name });
  const response = NextResponse.json({ ok: true, user: { email: user.email, name: user.name } });
  response.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions(), maxAge: SESSION_MAX_AGE });
  return response;
}
