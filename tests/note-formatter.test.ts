import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultSystemPromptFor,
  DEFAULT_MEETING_SYSTEM_PROMPT,
  DEFAULT_SYSTEM_PROMPT,
  formatNotes,
  SAMPLE_MEETING_NOTES,
  type FormatOptions,
} from "@/lib/note-formatter";

const planOptions: FormatOptions = { title: "", includeHelpers: true, includeQuestions: true, kind: "plan" };
const meetingOptions: FormatOptions = { title: "", includeHelpers: true, includeQuestions: true, kind: "meeting" };

describe("formatNotes — plan", () => {
  it("classifies action verbs as implementation steps", () => {
    const result = formatNotes("build a second cluster\nconfigure replication", planOptions);
    assert.equal(result.kind, "plan");
    assert.deepEqual(result.steps, ["Build a second cluster", "Configure replication"]);
  });

  it("classifies helper verbs as helper tasks", () => {
    const result = formatNotes("verify latency is under 5ms", planOptions);
    assert.deepEqual(result.helpers, ["Verify latency is under 5ms"]);
  });

  it("classifies trailing-? lines as open questions", () => {
    const result = formatNotes("what hypervisor are they using?", planOptions);
    assert.deepEqual(result.questions, ["What hypervisor are they using?"]);
  });

  it("dedupes repeated lines", () => {
    const result = formatNotes("build x\nbuild x", planOptions);
    assert.deepEqual(result.steps, ["Build x"]);
  });

  it("respects includeHelpers / includeQuestions toggles", () => {
    const result = formatNotes("verify x\nis it y?", {
      ...planOptions,
      includeHelpers: false,
      includeQuestions: false,
    });
    assert.deepEqual(result.helpers, []);
    assert.deepEqual(result.questions, []);
  });

  it("falls back to steps when nothing is an explicit action", () => {
    const result = formatNotes("context: some background only", planOptions);
    assert.ok(result.steps.length > 0);
  });

  it("produces markdown with the expected headings", () => {
    const md = formatNotes("build a cluster\nverify latency\nwhat hypervisor?", planOptions).markdown;
    assert.match(md, /## Implementation Plan/);
    assert.match(md, /## Helper Tasks/);
    assert.match(md, /## Open Questions/);
  });
});

describe("formatNotes — meeting", () => {
  it("parses date, attendees, and notes from the sample", () => {
    const result = formatNotes(SAMPLE_MEETING_NOTES, meetingOptions);
    assert.equal(result.kind, "meeting");
    assert.equal(result.date, "2026-06-02");
    assert.ok(result.attendees.length >= 3, `expected attendees, got ${JSON.stringify(result.attendees)}`);
    assert.ok(result.helpers.length > 0, "expected action items");
  });

  it("derives a meeting title from the date when none is given", () => {
    const result = formatNotes("Date: 2026-01-01\nNotes:\n- discussed roadmap", meetingOptions);
    assert.equal(result.title, "Meeting Notes: 2026-01-01");
  });

  it("splits attendees on commas and 'and'", () => {
    const result = formatNotes("Attendees: Alice, Bob and Carol\nNotes:\n- hi", meetingOptions);
    assert.deepEqual(result.attendees, ["Alice", "Bob", "Carol"]);
  });

  it("builds meeting markdown with Attendees and Action Items", () => {
    const md = formatNotes(SAMPLE_MEETING_NOTES, meetingOptions).markdown;
    assert.match(md, /## Attendees/);
    assert.match(md, /## Action Items/);
    assert.doesNotMatch(md, /## Implementation Plan/);
  });
});

describe("defaultSystemPromptFor", () => {
  it("returns the plan prompt for plan", () => {
    assert.equal(defaultSystemPromptFor("plan"), DEFAULT_SYSTEM_PROMPT);
  });
  it("returns the meeting prompt for meeting", () => {
    assert.equal(defaultSystemPromptFor("meeting"), DEFAULT_MEETING_SYSTEM_PROMPT);
  });
});
