// Nutanix brand tokens, extracted directly from the official
// "Nutanix Brand Template.pptx" theme (ppt/theme/theme1.xml). These are reused
// by both the in-app QBR slide preview and the .pptx exporter so the rendered
// deck is pixel-consistent with the web preview and on-brand.

export const NUTANIX = {
  // Core
  ink: "131313", // dk1 — near-black body text
  white: "FFFFFF", // lt1
  purple: "7855FA", // dk2 — primary brand purple (matches app iris-500)
  deepPurple: "4B00AA", // lt2 — deep purple (matches app iris-900)
  indigo: "391699", // accent6
  // Accents
  gray: "5D5D5D", // accent1
  cyan: "1FDDE9", // accent2
  green: "92DD23", // accent3
  coral: "FF9178", // accent4
  teal: "0092B0", // accent5
  // Derived neutrals used for cards / rules in the deck
  cloud: "F3F0FF", // iris-50 tint
  mist: "E0E1FF", // iris-100 tint
  line: "D7D7D7", // hairline rule
  slate: "8E8E8E", // secondary text
} as const;

export const NUTANIX_FONT = {
  display: "Montserrat ExtraLight", // majorFont in the brand theme - used for big titles
  heading: "Montserrat", // semibold/bold headings (stat numbers, card titles, table headers)
  body: "Montserrat", // minorFont - body copy
} as const;

// Status colors for health-check signals (utilization, license, EOL, etc.).
export const HEALTH = {
  good: "3F5E0A", // green text
  goodFill: "EEF8D8",
  warn: "B45309", // amber/orange text (clearly yellow-orange, distinct from bad's red)
  warnFill: "FEF3C7", // soft yellow tint
  bad: "9F1239", // red text
  badFill: "FFE4E6",
  neutral: NUTANIX.gray,
  neutralFill: "F0F0F0",
} as const;

export type HealthTone = "good" | "warn" | "bad" | "neutral";

// Hex helpers — preview (CSS) needs a leading '#', pptxgenjs wants bare hex.
export const cssHex = (h: string) => `#${h}`;
