import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_FIELD_LENGTH,
  MAX_NOTES_LENGTH,
  sanitizeField,
  sanitizeNotes,
  sanitizePrompt,
} from "@/lib/sanitize";

describe("sanitizeNotes", () => {
  it("normalizes CRLF to LF", () => {
    assert.equal(sanitizeNotes("a\r\nb\rc").text, "a\nb\nc");
  });

  it("strips control characters but keeps tab and newline", () => {
    const out = sanitizeNotes("a\u0000b\u0007c\td\ne").text;
    assert.equal(out, "abc\td\ne");
  });

  it("strips ANSI escape codes", () => {
    const out = sanitizeNotes("\u001b[31mred\u001b[0m text").text;
    assert.equal(out, "red text");
  });

  it("collapses 3+ blank lines and trims trailing whitespace", () => {
    const out = sanitizeNotes("a   \n\n\n\nb").text;
    assert.equal(out, "a\n\nb");
  });

  it("trims leading and trailing blank lines", () => {
    assert.equal(sanitizeNotes("\n\n  hello  \n\n").text, "  hello");
  });

  it("truncates beyond the max length and reports it", () => {
    const result = sanitizeNotes("x".repeat(MAX_NOTES_LENGTH + 50));
    assert.equal(result.truncated, true);
    assert.equal(result.text.length, MAX_NOTES_LENGTH);
    assert.equal(result.cleanedLength, MAX_NOTES_LENGTH + 50);
  });

  it("handles non-string input safely", () => {
    assert.deepEqual(sanitizeNotes(null), { text: "", truncated: false, cleanedLength: 0 });
    assert.deepEqual(sanitizeNotes(undefined), { text: "", truncated: false, cleanedLength: 0 });
    assert.deepEqual(sanitizeNotes(42), { text: "", truncated: false, cleanedLength: 0 });
  });
});

describe("sanitizeField", () => {
  it("collapses internal whitespace and newlines to single spaces", () => {
    assert.equal(sanitizeField("  a\n\tb   c  "), "a b c");
  });

  it("caps to the field length", () => {
    assert.equal(sanitizeField("y".repeat(MAX_FIELD_LENGTH + 10)).length, MAX_FIELD_LENGTH);
  });

  it("returns empty string for non-strings", () => {
    assert.equal(sanitizeField(undefined), "");
    assert.equal(sanitizeField({}), "");
  });
});

describe("sanitizePrompt", () => {
  it("keeps line breaks but strips control noise", () => {
    assert.equal(sanitizePrompt("line1\u0007\nline2"), "line1\nline2");
  });
});
