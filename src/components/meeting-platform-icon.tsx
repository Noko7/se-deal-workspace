import { Pointer } from "lucide-react";
import { detectMeetingPlatform, meetingPlatformLabel, type MeetingPlatform } from "@/lib/meeting";

// Real brand marks live in /public/meeting-icons. Zoom ships as its wordmark
// (wider), so we constrain by height and let the width scale naturally.
const ICONS: Record<MeetingPlatform, { src: string; className: string }> = {
  zoom: { src: "/meeting-icons/zoom.png", className: "h-4 w-auto" },
  teams: { src: "/meeting-icons/teams.png", className: "h-6 w-auto" },
  meet: { src: "/meeting-icons/meet.png", className: "h-6 w-auto" },
};

/**
 * Renders the meeting platform brand icon (Zoom / Teams / Google Meet) detected
 * from the Outlook join link. When a join URL is present the icon links straight
 * to the meeting so it can be joined from here.
 */
export function MeetingPlatformIcon({
  joinUrl,
  showAffordance = false,
}: {
  joinUrl: string | null | undefined;
  /** Append a pointer-finger icon to signal the badge is clickable. */
  showAffordance?: boolean;
}) {
  const platform = detectMeetingPlatform(joinUrl);
  if (!platform) return null;

  const label = meetingPlatformLabel(platform);
  const icon = ICONS[platform];
  const content = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon.src} alt={label} className={icon.className} />
      {showAffordance && joinUrl ? <Pointer className="h-3.5 w-3.5 shrink-0 text-iris-500" /> : null}
    </>
  );

  const className = "inline-flex items-center gap-1.5";

  if (joinUrl) {
    return (
      <a
        href={joinUrl}
        target="_blank"
        rel="noreferrer"
        title={`Join via ${label}`}
        className={`${className} transition hover:opacity-80`}
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
