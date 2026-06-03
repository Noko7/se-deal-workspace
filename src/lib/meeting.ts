export type MeetingPlatform = "zoom" | "teams" | "meet";

export type Attendee = {
  name: string;
  email: string;
  /** True when the name was guessed from the email (no real name on the invite). */
  predicted: boolean;
};

const PLATFORM_LABELS: Record<MeetingPlatform, string> = {
  zoom: "Zoom",
  teams: "Microsoft Teams",
  meet: "Google Meet",
};

export function meetingPlatformLabel(platform: MeetingPlatform): string {
  return PLATFORM_LABELS[platform];
}

/**
 * Detect the meeting platform from the Outlook join link. Outlook stores the
 * join URL on the calendar event, so the platform is implied by its host.
 */
export function detectMeetingPlatform(joinUrl: string | null | undefined): MeetingPlatform | null {
  if (!joinUrl) return null;
  const url = joinUrl.toLowerCase();
  if (url.includes("zoom.us") || url.includes("zoom.com")) return "zoom";
  if (url.includes("teams.microsoft.com") || url.includes("teams.live.com")) return "teams";
  if (url.includes("meet.google.com")) return "meet";
  return null;
}

/**
 * Guess a display name from an email local part. External attendees are usually
 * `firstname.lastname@company.com`, so we can predict a name. Returns null when
 * there's nothing useful to derive (e.g. a numeric or empty local part).
 */
export function predictNameFromEmail(email: string): string | null {
  const local = email.split("@")[0]?.trim();
  if (!local) return null;
  const tokens = local
    .split(/[._\-+]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !/^\d+$/.test(token));
  if (tokens.length === 0) return null;
  return tokens
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

type RawAttendee = { email?: unknown; displayName?: unknown; name?: unknown };

/**
 * Parse `Meeting.attendeesJson` into a normalized list. When an attendee has no
 * real name (common for external folks), predict one from the email and flag it
 * so the UI can show a "(maybe)" hint. Private meetings with no attendee data
 * return an empty list.
 */
export function parseAttendees(attendeesJson: string | null | undefined): Attendee[] {
  if (!attendeesJson) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(attendeesJson);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry): Attendee | null => {
      if (typeof entry === "string") {
        const email = entry.trim();
        if (!email) return null;
        const predicted = predictNameFromEmail(email);
        return { name: predicted ?? email, email, predicted: Boolean(predicted) };
      }
      if (entry && typeof entry === "object") {
        const obj = entry as RawAttendee;
        const email = typeof obj.email === "string" ? obj.email.trim() : "";
        const rawName =
          (typeof obj.displayName === "string" && obj.displayName.trim()) ||
          (typeof obj.name === "string" && obj.name.trim()) ||
          "";
        if (rawName && rawName.toLowerCase() !== email.toLowerCase()) {
          return { name: rawName, email, predicted: false };
        }
        if (!email) return null;
        const predicted = predictNameFromEmail(email);
        return { name: predicted ?? email, email, predicted: Boolean(predicted) };
      }
      return null;
    })
    .filter((attendee): attendee is Attendee => attendee !== null);
}
