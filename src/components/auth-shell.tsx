import type { ReactNode } from "react";

// Full-screen wrapper for the login / signup screens, styled after the
// My Nutanix sign-in page (light background, centered card, wordmark on top).
// Colors are explicit (not theme tokens) so the screen looks identical in
// light or dark app themes.
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-12" style={{ background: "#f5f6f8" }}>
      <div className="mb-9 flex items-center gap-3" aria-label="Nutanix SE Deal Workspace">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Nutanix-Black-Logo-Vector.svg-.png" alt="Nutanix" className="h-7 w-auto" />
        <span aria-hidden className="h-6 w-px" style={{ background: "#c7ccd4" }} />
        <span className="text-xl font-normal" style={{ color: "#131318" }}>
          SE Deal Workspace
        </span>
      </div>
      <div
        className="w-full max-w-md rounded-xl bg-white p-8"
        style={{ boxShadow: "0 1px 3px rgba(20,23,28,.10), 0 12px 32px rgba(20,23,28,.05)" }}
      >
        {children}
      </div>
    </div>
  );
}

// Shared input styling for the auth screens. Inline background/text colors win
// over the global `.dark input` rule so the form stays light in dark mode.
export const AUTH_INPUT_CLASS =
  "w-full rounded-md border px-3 py-2.5 text-sm outline-none transition focus:ring-2";
export const AUTH_INPUT_STYLE: React.CSSProperties = {
  backgroundColor: "#ffffff",
  color: "#131318",
  borderColor: "#c7ccd4",
};

export const AUTH_BLUE = "#3b5bc7";
export const AUTH_BLUE_HOVER = "#314ea8";
