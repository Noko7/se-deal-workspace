import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getZoomWebhookSecret, ingestZoomMeeting } from "@/lib/zoom";

export const dynamic = "force-dynamic";

// Verify Zoom's signed-webhook header:
//   x-zm-signature: v0=<HMAC_SHA256(secret, `v0:${timestamp}:${rawBody}`)>
function verifySignature(rawBody: string, signature: string | null, timestamp: string | null, secret: string): boolean {
  if (!signature || !timestamp) return false;
  const digest = createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex");
  const expected = `v0=${digest}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type ZoomEnvelope = {
  event?: string;
  payload?: {
    plainToken?: string;
    // Our integration expects the SE Deal Workspace meeting id plus the Zoom
    // artifacts. A production Zoom app maps its meeting UUID to our id and posts
    // them here (e.g. via the meeting topic or a stored mapping).
    object?: {
      meetingId?: string;
      summary?: string;
      transcript?: string;
      notes?: string;
    };
  };
  // Also accept a flat shape for direct/testing calls.
  meetingId?: string;
  summary?: string;
  transcript?: string;
  notes?: string;
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = await getZoomWebhookSecret();

  let body: ZoomEnvelope;
  try {
    body = JSON.parse(rawBody) as ZoomEnvelope;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  // Zoom's one-time endpoint URL validation handshake.
  if (body.event === "endpoint.url_validation" && body.payload?.plainToken) {
    if (!secret) {
      return NextResponse.json({ ok: false, message: "Zoom webhook secret is not configured." }, { status: 400 });
    }
    const encryptedToken = createHmac("sha256", secret).update(body.payload.plainToken).digest("hex");
    return NextResponse.json({ plainToken: body.payload.plainToken, encryptedToken });
  }

  // When a secret is configured, every event must be signed.
  if (secret) {
    const signature = request.headers.get("x-zm-signature");
    const timestamp = request.headers.get("x-zm-request-timestamp");
    if (!verifySignature(rawBody, signature, timestamp, secret)) {
      return NextResponse.json({ ok: false, message: "Invalid webhook signature." }, { status: 401 });
    }
  }

  const object = body.payload?.object ?? {};
  const meetingId = object.meetingId ?? body.meetingId;
  if (!meetingId) {
    return NextResponse.json({ ok: false, message: "Missing meetingId in webhook payload." }, { status: 400 });
  }

  const result = await ingestZoomMeeting({
    meetingId,
    summary: object.summary ?? body.summary ?? null,
    transcript: object.transcript ?? body.transcript ?? null,
    notes: object.notes ?? body.notes ?? null,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
