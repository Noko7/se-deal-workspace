// Input sanitization for the Note Formatter. Pure, dependency-free, and safe to
// import from both client and server. The goals:
//   - Keep payloads bounded (protect the UI, the API route, and the LLM).
//   - Strip control characters and terminal escape codes that can corrupt the
//     prompt or the rendered output (and that no human actually typed on purpose).
//   - Normalize whitespace so the offline parser and the model see clean text.
// It deliberately does NOT try to "detect prompt injection" — that's a losing
// game. Instead the API route always sends the user's notes inside a clearly
// delimited block so model instructions and content can't be confused.

export const MAX_NOTES_LENGTH = 20_000;
export const MAX_FIELD_LENGTH = 200;
export const MAX_PROMPT_LENGTH = 8_000;

// Matches ANSI / VT100 escape sequences (e.g. colour codes pasted from a shell).
const ANSI_ESCAPE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
// C0/C1 control characters except tab (\t), line feed (\n) and carriage return.
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

export type SanitizedText = {
  /** Cleaned text, capped at the supplied limit. */
  text: string;
  /** True when the input had to be truncated to fit the limit. */
  truncated: boolean;
  /** Length (in characters) of the cleaned text before truncation. */
  cleanedLength: number;
};

/**
 * Sanitize a multi-line block of notes. Normalizes line endings, removes control
 * characters and ANSI codes, trims trailing whitespace per line, collapses runs
 * of blank lines, and caps the total length.
 */
export function sanitizeNotes(input: unknown, maxLength: number = MAX_NOTES_LENGTH): SanitizedText {
  if (typeof input !== "string") {
    return { text: "", truncated: false, cleanedLength: 0 };
  }

  const cleaned = input
    .replace(/\r\n?/g, "\n")
    .replace(ANSI_ESCAPE, "")
    .replace(CONTROL_CHARS, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    // Collapse 3+ consecutive newlines down to a single blank line.
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");

  const cleanedLength = cleaned.length;
  const truncated = cleanedLength > maxLength;
  return {
    text: truncated ? cleaned.slice(0, maxLength) : cleaned,
    truncated,
    cleanedLength,
  };
}

/**
 * Sanitize a short single-line field (title, instructions). Collapses all
 * internal whitespace to single spaces, strips control characters, and caps
 * length. Returns just the string since callers rarely need the metadata.
 */
export function sanitizeField(input: unknown, maxLength: number = MAX_FIELD_LENGTH): string {
  if (typeof input !== "string") {
    return "";
  }
  const cleaned = input
    .replace(ANSI_ESCAPE, "")
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength).trim() : cleaned;
}

/**
 * Sanitize a (potentially multi-line) system prompt. Keeps line breaks but
 * strips control/ANSI noise and caps length.
 */
export function sanitizePrompt(input: unknown, maxLength: number = MAX_PROMPT_LENGTH): string {
  return sanitizeNotes(input, maxLength).text;
}
