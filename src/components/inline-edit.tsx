"use client";

import { useLayoutEffect, useRef, useState } from "react";

// Click-to-edit primitives shared by the QBR Deck Builder and the Proposal
// Builder, so both editors commit text the same way: contentEditable,
// uncontrolled (so typing never fights a React reconcile / jumps the caret),
// commit on blur, revert on Escape. Bullet lists are "removed" simply by
// deleting their line in the text -- there is no separate delete button.

export function EditableText({
  value,
  multiline,
  textAlign = "left",
  fontStyle = {},
  className,
  inline,
  onCommit,
}: {
  value: string;
  multiline?: boolean;
  textAlign?: "left" | "center" | "right";
  fontStyle?: React.CSSProperties;
  className?: string;
  // Block (default, width: 100%) fits QBR's absolutely-positioned slide text
  // boxes; inline sizes to content, for chip-like fields sitting in a flex row.
  inline?: boolean;
  onCommit: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== value) el.textContent = value;
  }, [value]);

  return (
    <div
      ref={ref}
      className={["qbr-editable", className].filter(Boolean).join(" ")}
      contentEditable
      suppressContentEditableWarning
      title="Click to edit"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          if (ref.current) ref.current.textContent = value;
          ref.current?.blur();
        } else if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          ref.current?.blur();
        }
      }}
      onBlur={() => {
        const t = ref.current?.textContent ?? "";
        if (t !== value) onCommit(t);
      }}
      style={{
        ...fontStyle,
        width: inline ? undefined : "100%",
        minWidth: inline ? "1ch" : undefined,
        display: inline ? "inline-block" : undefined,
        textAlign,
        outline: "none",
        cursor: "text",
        whiteSpace: multiline ? "pre-wrap" : "normal",
      }}
    />
  );
}

export function EditableList({
  items,
  bulletColor = "#7B61FF",
  bulletMarginTop = 8,
  fontStyle = {},
  editable,
  onCommit,
  renderReadOnly,
  className,
}: {
  items: string[];
  bulletColor?: string;
  bulletMarginTop?: number;
  fontStyle?: React.CSSProperties;
  editable: boolean;
  onCommit: (lines: string[]) => void;
  renderReadOnly?: (items: string[]) => React.ReactNode;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (editing && ref.current) {
      ref.current.innerText = items.join("\n");
      ref.current.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    // Only re-seed the editor when entering edit mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (editable && editing) {
    // key="edit" forces React to mount a fresh node when leaving edit mode
    // rather than reusing this div. The editor is seeded imperatively via
    // innerText (invisible to React's vdom); without the key change, React would
    // reuse the div on blur and leave those stray text nodes behind next to the
    // re-rendered read-only content -- a doubled, oversized ghost.
    return (
      <div
        key="edit"
        ref={ref}
        className={["qbr-editable", className].filter(Boolean).join(" ")}
        contentEditable
        suppressContentEditableWarning
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        onBlur={() => {
          const lines = (ref.current?.innerText ?? "")
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          setEditing(false);
          onCommit(lines);
        }}
        style={{ lineHeight: 1.4, ...fontStyle, width: "100%", outline: "none", cursor: "text", whiteSpace: "pre-wrap" }}
      />
    );
  }

  if (renderReadOnly) {
    return (
      <div
        key="read"
        className={[editable ? "qbr-editable" : undefined, className].filter(Boolean).join(" ")}
        title={editable ? "Click to edit" : undefined}
        onClick={() => editable && setEditing(true)}
        style={{ cursor: editable ? "text" : "default" }}
      >
        {renderReadOnly(items)}
      </div>
    );
  }

  return (
    <div
      key="read"
      className={editable ? "qbr-editable" : undefined}
      title={editable ? "Click to edit" : undefined}
      onClick={() => editable && setEditing(true)}
      style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", cursor: editable ? "text" : "default" }}
    >
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", gap: 9, lineHeight: 1.4, ...fontStyle }}>
          <span style={{ marginTop: bulletMarginTop, width: 7, height: 7, borderRadius: "50%", background: bulletColor, flexShrink: 0 }} />
          <span>{it}</span>
        </div>
      ))}
    </div>
  );
}
