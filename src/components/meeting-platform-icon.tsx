import { detectMeetingPlatform, meetingPlatformLabel, type MeetingPlatform } from "@/lib/meeting";

function ZoomGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="h-4 w-4" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2D8CFF" />
      <path
        d="M8 12.5c0-.83.67-1.5 1.5-1.5h7c.83 0 1.5.67 1.5 1.5v7c0 .83-.67 1.5-1.5 1.5h-7A1.5 1.5 0 0 1 8 19.5v-7Zm11 1.7 4-2.5c.5-.32 1.2.04 1.2.66v8.28c0 .62-.7.98-1.2.66l-4-2.5v-4.6Z"
        fill="#fff"
      />
    </svg>
  );
}

function TeamsGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="h-4 w-4" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#5059C9" />
      <circle cx="20.5" cy="11" r="2.6" fill="#fff" opacity="0.9" />
      <rect x="8" y="12" width="11" height="10" rx="2" fill="#fff" />
      <text x="13.5" y="20" fontSize="9" fontWeight="700" fill="#5059C9" textAnchor="middle" fontFamily="Arial, sans-serif">
        T
      </text>
      <path d="M21 14.5h3.4c.6 0 .6.4.6.9v4.2c0 1.6-1.3 2.9-3 2.9-.6 0-1-.1-1.5-.3v-7.7Z" fill="#7B83EB" />
    </svg>
  );
}

function MeetGlyph() {
  return (
    <svg viewBox="0 0 32 32" className="h-4 w-4" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#fff" stroke="#e0e0e0" />
      <path d="M9 12.5c0-.83.67-1.5 1.5-1.5H17v8H10.5A1.5 1.5 0 0 1 9 17.5v-5Z" fill="#00832D" />
      <path d="M17 14.2l4-2.5c.5-.3 1.1.05 1.1.64v7.3c0 .59-.6.94-1.1.64l-4-2.5v-3.6Z" fill="#00AC47" />
      <path d="M17 11h4.6c.77 0 1.4.63 1.4 1.4V14l-6-1.8V11Z" fill="#FFBA00" />
      <path d="M17 20h4.6c.77 0 1.4-.63 1.4-1.4V17l-6 1.8V20Z" fill="#0066DA" />
      <path d="M9 17.5c0 .83.67 1.5 1.5 1.5H17v-7H9v5Z" fill="#2684FC" opacity="0.0" />
    </svg>
  );
}

const GLYPHS: Record<MeetingPlatform, () => React.ReactElement> = {
  zoom: ZoomGlyph,
  teams: TeamsGlyph,
  meet: MeetGlyph,
};

/**
 * Renders the meeting platform badge (Zoom / Teams / Google Meet) detected from
 * the Outlook join link. When a join URL is present it links straight to the
 * meeting so it can be joined from here.
 */
export function MeetingPlatformIcon({ joinUrl }: { joinUrl: string | null | undefined }) {
  const platform = detectMeetingPlatform(joinUrl);
  if (!platform) return null;

  const label = meetingPlatformLabel(platform);
  const Glyph = GLYPHS[platform];
  const content = (
    <>
      <Glyph />
      <span className="font-medium">{label}</span>
    </>
  );

  const className =
    "inline-flex items-center gap-1.5 rounded-md border border-charcoal-200 bg-white px-2 py-1 text-xs text-charcoal-700";

  if (joinUrl) {
    return (
      <a
        href={joinUrl}
        target="_blank"
        rel="noreferrer"
        title={`Join via ${label}`}
        className={`${className} transition hover:border-iris-300 hover:text-iris-700`}
      >
        {content}
      </a>
    );
  }

  return (
    <span className={className} title={label}>
      {content}
    </span>
  );
}
