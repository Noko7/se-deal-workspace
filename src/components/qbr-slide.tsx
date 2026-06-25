"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NUTANIX, cssHex } from "@/lib/nutanix-brand";
import type { QbrDeckMeta, QbrSlide } from "@/lib/qbr-deck";
import {
  compileSlide,
  niceAxisMax,
  pageNumberElement,
  ptToPx,
  PX_PER_IN,
  type ChartElement,
  type SlideElement,
  type TableElement,
  type TextElement,
} from "@/lib/qbr-layout";

// Renders one QBR slide on a fixed 1280x720 (16:9) board by walking the shared
// layout IR (compileSlide). Every element is absolutely positioned at the exact
// inch coordinates the .pptx exporter uses, so the preview is true WYSIWYG. When
// `editable` is set, text elements become click-to-edit and commit back into the
// deck model via `onPatch(path, value)`.

const BOARD_W = 1280;
const BOARD_H = 720;

type PatchFn = (path: string, value: string | string[] | number) => void;

const inToPx = (v: number) => v * PX_PER_IN;

function alignToFlex(a?: "left" | "center" | "right"): string {
  return a === "center" ? "center" : a === "right" ? "flex-end" : "flex-start";
}
function valignToFlex(v?: "top" | "middle" | "bottom"): string {
  return v === "middle" ? "center" : v === "bottom" ? "flex-end" : "flex-start";
}

// --- editable text -----------------------------------------------------------

function EditableText({
  value,
  multiline,
  textAlign,
  fontStyle,
  onCommit,
}: {
  value: string;
  multiline?: boolean;
  textAlign: "left" | "center" | "right";
  fontStyle: React.CSSProperties;
  onCommit: (v: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Uncontrolled: seed/refresh textContent imperatively so typing never causes a
  // React reconcile that would jump the caret. useLayoutEffect avoids a mount flash.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== value) el.textContent = value;
  }, [value]);

  return (
    <div
      ref={ref}
      className="qbr-editable"
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
      style={{ ...fontStyle, width: "100%", textAlign, outline: "none", cursor: "text", whiteSpace: multiline ? "pre-wrap" : "normal" }}
    />
  );
}

function EditableList({
  items,
  bulletColor,
  fontStyle,
  editable,
  onCommit,
}: {
  items: string[];
  bulletColor: string;
  fontStyle: React.CSSProperties;
  editable: boolean;
  onCommit: (lines: string[]) => void;
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
    return (
      <div
        ref={ref}
        className="qbr-editable"
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
        style={{ ...fontStyle, width: "100%", outline: "none", cursor: "text", whiteSpace: "pre-wrap", lineHeight: 1.4 }}
      />
    );
  }

  return (
    <div
      className={editable ? "qbr-editable" : undefined}
      title={editable ? "Click to edit" : undefined}
      onClick={() => editable && setEditing(true)}
      style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", cursor: editable ? "text" : "default" }}
    >
      {items.map((it, i) => (
        <div key={i} style={{ display: "flex", gap: 9, lineHeight: 1.4, ...fontStyle }}>
          <span style={{ marginTop: ptToPx(6), width: 7, height: 7, borderRadius: "50%", background: cssHex(bulletColor), flexShrink: 0 }} />
          <span>{it}</span>
        </div>
      ))}
    </div>
  );
}

// --- charts ------------------------------------------------------------------

const FRACTIONS = [0, 0.25, 0.5, 0.75, 1]; // y-axis gridline positions (bottom -> top)

/** Compact, axis-friendly tick number (e.g. 4_200_000 -> "4.2M"); only "%" units are appended. */
function tickLabel(v: number, unit?: string): string {
  const a = Math.abs(v);
  let s: string;
  if (a >= 1e9) s = (v / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, "") + "B";
  else if (a >= 1e6) s = (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  else if (a >= 1e3) s = (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
  else s = String(Math.round(v * 10) / 10);
  return unit === "%" ? `${s}%` : s;
}

const AXIS_COLOR = cssHex(NUTANIX.slate);
const GRID_COLOR = cssHex(NUTANIX.line);
const TICK_COLOR = cssHex(NUTANIX.gray);
const Y_GUTTER = 50;

function Bars({ el, editable, onPatch }: { el: ChartElement; editable: boolean; onPatch?: PatchFn }) {
  const series = el.barSeries ?? [];
  const unit = el.unit ?? "";
  const valueColor = cssHex(NUTANIX.ink);
  const dataMax = Math.max(...series.map((s) => s.value), el.max ?? 0, 1);
  const axisMax = niceAxisMax(dataMax);
  const H = inToPx(el.h);
  const padTop = 28; // headroom for the value labels above each bar
  const padBottom = 30; // room for the x-axis category labels
  const band = Math.max(20, H - padTop - padBottom);
  const yAt = (f: number) => padTop + (1 - f) * band;
  return (
    <div style={{ display: "flex", height: H, width: "100%" }}>
      {/* y-axis */}
      <div style={{ position: "relative", width: Y_GUTTER, height: H, flexShrink: 0 }}>
        {FRACTIONS.map((f) => (
          <span key={f} style={{ position: "absolute", right: 8, top: yAt(f) - 9, fontSize: 14, lineHeight: "18px", color: TICK_COLOR }}>
            {tickLabel(axisMax * f, unit)}
          </span>
        ))}
      </div>
      {/* plot */}
      <div style={{ position: "relative", flex: 1, height: H }}>
        {FRACTIONS.map((f) => (
          <div key={f} style={{ position: "absolute", left: 0, right: 0, top: yAt(f), height: 1, background: f === 0 ? AXIS_COLOR : GRID_COLOR }} />
        ))}
        <div style={{ position: "absolute", left: 0, right: 0, top: padTop, height: band, display: "flex", alignItems: "flex-end", gap: 28, padding: "0 10px" }}>
          {series.map((s, i) => {
            const hPx = Math.max(0, (s.value / axisMax) * band);
            return (
              <div key={i} style={{ flex: 1, display: "flex", justifyContent: "center", height: "100%", alignItems: "flex-end" }}>
                <div style={{ width: "62%", height: hPx, background: cssHex(NUTANIX.purple), borderRadius: "8px 8px 0 0", position: "relative" }}>
                  <span style={{ position: "absolute", top: -26, left: 0, right: 0, textAlign: "center", fontWeight: 700, fontSize: 20, color: valueColor }}>
                    {editable && onPatch && s.valuePath ? (
                      <EditableText
                        value={String(s.value)}
                        textAlign="center"
                        fontStyle={{ fontWeight: 700, fontSize: 20, color: valueColor }}
                        onCommit={(v) => {
                          const n = Number(v.replace(/[^0-9.-]/g, ""));
                          if (Number.isFinite(n)) onPatch(s.valuePath!, n);
                        }}
                      />
                    ) : (
                      <>
                        {s.value}
                        {unit}
                      </>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {/* x-axis labels */}
        <div style={{ position: "absolute", left: 0, right: 0, top: padTop + band + 7, display: "flex", gap: 28, padding: "0 10px" }}>
          {series.map((s, i) => (
            <span key={i} style={{ flex: 1, textAlign: "center", fontSize: 16, color: TICK_COLOR }}>
              {editable && onPatch && s.labelPath ? (
                <EditableText value={s.label} textAlign="center" fontStyle={{ fontSize: 16, color: TICK_COLOR }} onCommit={(v) => onPatch(s.labelPath!, v)} />
              ) : (
                s.label
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Lines({ el, editable, onPatch }: { el: ChartElement; editable: boolean; onPatch?: PatchFn }) {
  const series = el.lineSeries ?? [];
  const colors = el.colors.map(cssHex);
  const unit = el.unit ?? "";
  const all = series.flatMap((s) => s.points);
  const axisMax = niceAxisMax(Math.max(...all, 1));
  const n = series[0]?.points.length ?? 1;
  const xLabels = el.xLabels ?? Array.from({ length: n }, (_, i) => String(i + 1));
  const w = inToPx(el.w);
  const legendH = el.showLegend ? 36 : 0;
  const chartH = inToPx(el.h) - legendH;
  const padTop = 14;
  const padBottom = 26; // x-axis labels
  const padRight = 14;
  const band = Math.max(20, chartH - padTop - padBottom);
  const plotW = Math.max(20, w - Y_GUTTER - padRight);
  const xStep = plotW / Math.max(1, n - 1);
  const xOf = (i: number) => Y_GUTTER + i * xStep;
  const yOf = (v: number) => padTop + (1 - v / axisMax) * band;
  const yBase = padTop + band;
  // Thin out crowded x labels to ~6 ticks max.
  const labelStep = Math.max(1, Math.ceil(n / 6));
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <svg width={w} height={chartH} style={{ overflow: "visible" }}>
        {/* y gridlines + tick labels */}
        {FRACTIONS.map((f) => {
          const y = padTop + (1 - f) * band;
          return (
            <g key={f}>
              <line x1={Y_GUTTER} x2={w - padRight} y1={y} y2={y} stroke={f === 0 ? AXIS_COLOR : GRID_COLOR} strokeWidth={1} />
              <text x={Y_GUTTER - 8} y={y + 5} textAnchor="end" fontSize={14} fill={TICK_COLOR}>
                {tickLabel(axisMax * f, unit)}
              </text>
            </g>
          );
        })}
        {/* y axis line */}
        <line x1={Y_GUTTER} x2={Y_GUTTER} y1={padTop} y2={yBase} stroke={AXIS_COLOR} strokeWidth={1} />
        {/* x tick labels */}
        {xLabels.map((lbl, i) =>
          i % labelStep === 0 || i === n - 1 ? (
            <text key={i} x={xOf(i)} y={yBase + 18} textAnchor="middle" fontSize={14} fill={TICK_COLOR}>
              {lbl}
            </text>
          ) : null,
        )}
        {/* series */}
        {series.map((s, si) => {
          const pts = s.points.map((p, i) => `${xOf(i)},${yOf(p)}`).join(" ");
          return (
            <g key={si}>
              <polyline points={pts} fill="none" stroke={colors[si % colors.length]} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
              {s.points.map((p, i) => (
                <circle key={i} cx={xOf(i)} cy={yOf(p)} r={4} fill={colors[si % colors.length]} />
              ))}
            </g>
          );
        })}
      </svg>
      {el.showLegend ? (
        <div style={{ display: "flex", gap: 24, justifyContent: "center", marginTop: 6 }}>
          {series.map((s, si) => (
            <span key={si} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 16, color: cssHex(NUTANIX.gray) }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: colors[si % colors.length] }} />
              {editable && onPatch && s.labelPath ? (
                <EditableText value={s.label} textAlign="left" fontStyle={{ fontSize: 16, color: cssHex(NUTANIX.gray) }} onCommit={(v) => onPatch(s.labelPath!, v)} />
              ) : (
                s.label
              )}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// --- element renderers -------------------------------------------------------

function TextBox({ el, editable, onPatch }: { el: TextElement; editable: boolean; onPatch?: PatchFn }) {
  const fontStyle: React.CSSProperties = {
    fontFamily: `${el.fontFace}, ui-sans-serif, system-ui, sans-serif`,
    fontSize: ptToPx(el.fontSize),
    fontWeight: el.bold ? 800 : 400,
    fontStyle: el.italic ? "italic" : "normal",
    color: cssHex(el.color),
    letterSpacing: el.charSpacing ? ptToPx(el.charSpacing) : undefined,
    lineHeight: 1.2,
  };
  const box: React.CSSProperties = {
    position: "absolute",
    left: inToPx(el.x),
    top: inToPx(el.y),
    width: inToPx(el.w),
    height: inToPx(el.h),
    display: "flex",
    flexDirection: "column",
    alignItems: alignToFlex(el.align),
    justifyContent: valignToFlex(el.valign),
    overflow: "hidden",
  };

  // bulleted list
  if (el.lines) {
    return (
      <div style={box}>
        <EditableList
          items={el.lines}
          bulletColor={el.bulletColor ?? NUTANIX.purple}
          fontStyle={fontStyle}
          editable={Boolean(editable && el.edit && onPatch)}
          onCommit={(lines) => el.edit && onPatch?.(el.edit.path, lines)}
        />
      </div>
    );
  }

  const text = (el.runs ?? []).map((r) => r.text).join("");
  const align = el.align ?? "left";

  if (editable && el.edit && onPatch) {
    return (
      <div style={box}>
        <EditableText
          value={text}
          multiline={el.edit.multiline}
          textAlign={align}
          fontStyle={fontStyle}
          onCommit={(v) => {
            if (!el.edit) return;
            if (el.edit.kind === "number") {
              const n = Number(v.replace(/[^0-9.-]/g, ""));
              if (Number.isFinite(n)) onPatch(el.edit.path, n);
            } else {
              onPatch(el.edit.path, v);
            }
          }}
        />
      </div>
    );
  }

  // static (multi-run aware)
  return (
    <div style={box}>
      <div style={{ ...fontStyle, width: "100%", textAlign: align }}>
        {(el.runs ?? []).map((r, i) => (
          <span key={i} style={{ fontWeight: r.bold ? 800 : el.bold ? 800 : 400, fontStyle: r.italic ? "italic" : undefined, color: r.color ? cssHex(r.color) : undefined }}>
            {r.text}
          </span>
        ))}
      </div>
    </div>
  );
}

function TableBox({ el, editable, onPatch }: { el: TableElement; editable: boolean; onPatch?: PatchFn }) {
  const box: React.CSSProperties = {
    position: "absolute",
    left: inToPx(el.x),
    top: inToPx(el.y),
    width: inToPx(el.w),
    height: inToPx(el.h),
    overflow: "hidden",
  };
  return (
    <div style={box}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif", tableLayout: "fixed" }}>
        <thead>
          <tr>
            {el.header.map((cell, ci) => (
              <th key={ci} style={{ background: cell.fill ? cssHex(cell.fill) : undefined, color: cell.color ? cssHex(cell.color) : "#fff", textAlign: cell.align ?? "left", padding: "10px 12px", fontWeight: 700, fontSize: ptToPx(11) }}>
                {editable && cell.edit && onPatch ? (
                  <EditableText value={cell.text} textAlign={cell.align ?? "left"} fontStyle={{ color: cell.color ? cssHex(cell.color) : "#fff", fontWeight: 700, fontSize: ptToPx(11) }} onCommit={(v) => onPatch(cell.edit!.path, v)} />
                ) : (
                  cell.text
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {el.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "9px 12px",
                    borderBottom: `1px solid ${cssHex(el.borderColor)}`,
                    background: cell.fill ? cssHex(cell.fill) : undefined,
                    color: cell.color ? cssHex(cell.color) : cssHex(NUTANIX.ink),
                    fontWeight: cell.bold ? 700 : 400,
                    fontSize: ptToPx(10),
                  }}
                >
                  {editable && cell.edit && onPatch ? (
                    <EditableText value={cell.text} textAlign={cell.align ?? "left"} fontStyle={{ color: cell.color ? cssHex(cell.color) : cssHex(NUTANIX.ink), fontWeight: cell.bold ? 700 : 400, fontSize: ptToPx(10) }} onCommit={(v) => onPatch(cell.edit!.path, v)} />
                  ) : (
                    cell.text
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Element({ el, editable, onPatch }: { el: SlideElement; editable: boolean; onPatch?: PatchFn }) {
  switch (el.kind) {
    case "shape": {
      const base: React.CSSProperties = {
        position: "absolute",
        left: inToPx(el.x),
        top: inToPx(el.y),
        width: inToPx(el.w),
        height: inToPx(el.h),
      };
      if (el.shape === "line") {
        return <div style={{ ...base, height: 0, borderTop: `${el.line?.width ?? 1}px solid ${cssHex(el.line?.color ?? NUTANIX.line)}` }} />;
      }
      return (
        <div
          style={{
            ...base,
            background: el.fill ? cssHex(el.fill) : "transparent",
            border: el.line ? `${el.line.width}px solid ${cssHex(el.line.color)}` : undefined,
            borderRadius: el.shape === "ellipse" ? "50%" : el.rectRadius ? inToPx(el.rectRadius) : undefined,
          }}
        />
      );
    }
    case "image":
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={el.dataUrl} alt="" style={{ position: "absolute", left: inToPx(el.x), top: inToPx(el.y), width: inToPx(el.w), height: inToPx(el.h), objectFit: "contain" }} />;
    case "chart": {
      const box: React.CSSProperties = { position: "absolute", left: inToPx(el.x), top: inToPx(el.y), width: inToPx(el.w), height: inToPx(el.h) };
      return <div style={box}>{el.chart === "bar" ? <Bars el={el} editable={editable} onPatch={onPatch} /> : <Lines el={el} editable={editable} onPatch={onPatch} />}</div>;
    }
    case "table":
      return <TableBox el={el} editable={editable} onPatch={onPatch} />;
    case "text":
      return <TextBox el={el} editable={editable} onPatch={onPatch} />;
    default:
      return null;
  }
}

export function QbrSlideBoard({
  slide,
  meta,
  logo,
  page,
  editable = false,
  onPatch,
}: {
  slide: QbrSlide;
  meta: QbrDeckMeta;
  logo: string | null;
  page?: number;
  editable?: boolean;
  onPatch?: PatchFn;
}) {
  const compiled = compileSlide(slide, meta, logo);
  const isCover = slide.content.type === "title" || slide.content.type === "closing";
  const elements = [...compiled.elements];
  if (!isCover && page) elements.push(pageNumberElement(page));

  return (
    <div
      style={{
        width: BOARD_W,
        height: BOARD_H,
        background: compiled.background ? cssHex(compiled.background) : "#fff",
        position: "relative",
        overflow: "hidden",
        fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      {elements.map((el, i) => (
        <Element key={i} el={el} editable={editable} onPatch={onPatch} />
      ))}
    </div>
  );
}

export function QbrSlideFrame({
  slide,
  meta,
  logo,
  page,
  editable = false,
  onPatch,
  className,
}: {
  slide: QbrSlide;
  meta: QbrDeckMeta;
  logo: string | null;
  page?: number;
  editable?: boolean;
  onPatch?: PatchFn;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / BOARD_W);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", overflow: "hidden", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.12)", border: `1px solid ${cssHex(NUTANIX.line)}` }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, width: BOARD_W, height: BOARD_H, transformOrigin: "top left", transform: `scale(${scale})` }}>
        <QbrSlideBoard slide={slide} meta={meta} logo={logo} page={page} editable={editable} onPatch={onPatch} />
      </div>
    </div>
  );
}
