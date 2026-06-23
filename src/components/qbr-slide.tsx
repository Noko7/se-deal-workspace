"use client";

import { useEffect, useRef, useState } from "react";
import { NUTANIX, HEALTH, cssHex, type HealthTone } from "@/lib/nutanix-brand";
import type { Cell, QbrDeckMeta, QbrSlide, SlideContent } from "@/lib/qbr-deck";

// Renders one QBR slide on a fixed 1280×720 (16:9) board in the official Nutanix
// brand style. Scaled to fit its container by the parent <QbrSlideFrame>. The
// same component powers the on-screen preview and the print/PDF view.

const BOARD_W = 1280;
const BOARD_H = 720;

function toneColors(tone?: HealthTone): { color: string; bg: string } {
  switch (tone) {
    case "good":
      return { color: cssHex(HEALTH.good), bg: cssHex(HEALTH.goodFill) };
    case "warn":
      return { color: cssHex(HEALTH.warn), bg: cssHex(HEALTH.warnFill) };
    case "bad":
      return { color: cssHex(HEALTH.bad), bg: cssHex(HEALTH.badFill) };
    default:
      return { color: cssHex(NUTANIX.ink), bg: "#ffffff" };
  }
}

const cellText = (c: Cell) => (typeof c === "string" ? c : c.text);
const cellTone = (c: Cell): HealthTone | undefined => (typeof c === "string" ? undefined : c.tone);

function LineChart({ series, unit }: { series: { label: string; points: number[] }[]; unit: string }) {
  const colors = [NUTANIX.purple, NUTANIX.cyan, NUTANIX.green, NUTANIX.coral, NUTANIX.teal].map(cssHex);
  const all = series.flatMap((s) => s.points);
  const max = Math.max(...all, 1);
  const w = 1184;
  const h = series.length > 1 ? 360 : 400;
  const pad = 36;
  const xStep = (w - pad * 2) / Math.max(1, (series[0]?.points.length ?? 1) - 1);
  const yOf = (v: number) => pad + (1 - v / (max * 1.1)) * (h - pad * 2);
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={pad + g * (h - pad * 2)} y2={pad + g * (h - pad * 2)} stroke={cssHex(NUTANIX.line)} strokeWidth={1} />
      ))}
      {series.map((s, si) => {
        const pts = s.points.map((p, i) => `${pad + i * xStep},${yOf(p)}`).join(" ");
        return (
          <g key={s.label}>
            <polyline points={pts} fill="none" stroke={colors[si % colors.length]} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((p, i) => (
              <circle key={i} cx={pad + i * xStep} cy={yOf(p)} r={4} fill={colors[si % colors.length]} />
            ))}
          </g>
        );
      })}
      {series.length > 1
        ? series.map((s, si) => (
            <g key={`lg-${s.label}`} transform={`translate(${pad + si * 220}, ${h + 16})`}>
              <rect width={14} height={14} rx={3} fill={colors[si % colors.length]} />
              <text x={20} y={12} fontSize={16} fill={cssHex(NUTANIX.gray)}>
                {s.label}
              </text>
            </g>
          ))
        : null}
      {unit ? (
        <text x={pad} y={20} fontSize={14} fill={cssHex(NUTANIX.slate)}>
          max {max}
          {unit}
        </text>
      ) : null}
    </svg>
  );
}

function Bars({ series, unit, max }: { series: { label: string; value: number; tone?: HealthTone }[]; unit: string; max?: number }) {
  const top = max ?? Math.max(...series.map((s) => s.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 28, height: 400, padding: "20px 8px 0" }}>
      {series.map((s) => {
        const pctH = (s.value / (top * 1.15)) * 100;
        return (
          <div key={s.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%" }}>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%", justifyContent: "center" }}>
              <div
                style={{
                  width: "62%",
                  height: `${pctH}%`,
                  background: `linear-gradient(180deg, ${cssHex(NUTANIX.purple)}, ${cssHex(NUTANIX.deepPurple)})`,
                  borderRadius: "8px 8px 0 0",
                  position: "relative",
                }}
              >
                <span style={{ position: "absolute", top: -34, left: 0, right: 0, textAlign: "center", fontWeight: 700, fontSize: 22, color: cssHex(NUTANIX.ink) }}>
                  {s.value}
                  {unit}
                </span>
              </div>
            </div>
            <span style={{ marginTop: 12, fontSize: 18, color: cssHex(NUTANIX.gray) }}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Content({ content }: { content: SlideContent }) {
  switch (content.type) {
    case "agenda":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, justifyContent: "center", height: "100%" }}>
          {content.items.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <span style={{ width: 48, height: 48, borderRadius: 10, background: cssHex(NUTANIX.cloud), color: cssHex(NUTANIX.purple), display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 22 }}>{i + 1}</span>
              <span style={{ fontSize: 24, color: cssHex(NUTANIX.ink) }}>{item}</span>
            </div>
          ))}
        </div>
      );
    case "team":
      return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(content.members.length, 4)}, 1fr)`, gap: 22, height: "100%", alignItems: "center" }}>
          {content.members.map((m) => {
            const initials = m.name.replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "—";
            return (
              <div key={m.role} style={{ border: `1px solid ${cssHex(NUTANIX.mist)}`, borderRadius: 16, background: "#FBFAFF", padding: "28px 18px", textAlign: "center" }}>
                <div style={{ width: 88, height: 88, borderRadius: "50%", margin: "0 auto 16px", background: `linear-gradient(135deg, ${cssHex(NUTANIX.purple)}, ${cssHex(NUTANIX.deepPurple)})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800 }}>{initials}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: cssHex(NUTANIX.ink) }}>{m.name}</div>
                <div style={{ fontSize: 15, color: cssHex(NUTANIX.purple), marginTop: 4 }}>{m.role}</div>
              </div>
            );
          })}
        </div>
      );
    case "bullets": {
      const cols = content.columns ?? content.groups.length;
      return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 28, height: "100%", alignContent: "center" }}>
          {content.groups.map((g, gi) => {
            const tc = toneColors(g.tone);
            return (
              <div key={gi} style={{ display: "flex", flexDirection: "column" }}>
                {g.heading ? <div style={{ fontSize: 19, fontWeight: 800, color: cssHex(NUTANIX.purple), marginBottom: 14 }}>{g.heading}</div> : null}
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 11 }}>
                  {g.items.map((it, ii) => (
                    <li key={ii} style={{ display: "flex", gap: 11, fontSize: 17, color: cssHex(NUTANIX.ink), lineHeight: 1.4 }}>
                      <span style={{ marginTop: 8, width: 8, height: 8, borderRadius: "50%", background: g.tone ? tc.color : cssHex(NUTANIX.purple), flexShrink: 0 }} />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      );
    }
    case "meters": {
      const globalMax = Math.max(...content.items.map((x) => x.max ?? x.value), 1);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, justifyContent: "center", height: "100%" }}>
          {content.items.map((it, ii) => {
            const tc = toneColors(it.tone);
            const max = it.max ?? globalMax;
            const w = Math.max(2, (it.value / (max || 1)) * 100);
            const barColor = it.tone ? tc.color : cssHex(NUTANIX.purple);
            return (
              <div key={ii} style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <div style={{ width: 240, fontSize: 17, color: cssHex(NUTANIX.ink), textAlign: "right", flexShrink: 0 }}>{it.label}</div>
                <div style={{ flex: 1, height: 24, background: "#EEEEF6", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ width: `${w}%`, height: "100%", background: barColor, borderRadius: 999 }} />
                </div>
                <div style={{ width: 150, fontSize: 18, fontWeight: 800, color: barColor, flexShrink: 0 }}>{it.display ?? `${it.value}${content.unit ?? ""}`}</div>
              </div>
            );
          })}
        </div>
      );
    }
    case "metrics": {
      const cols = content.groups.length > 2 ? 2 : content.groups.length;
      return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 20, height: "100%" }}>
          {content.groups.map((g) => (
            <div key={g.label} style={{ border: `1px solid ${cssHex(NUTANIX.mist)}`, borderRadius: 14, background: "#FBFAFF", overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ height: 6, background: cssHex(NUTANIX.purple) }} />
              <div style={{ padding: "14px 20px", flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 1, color: cssHex(NUTANIX.purple), textTransform: "uppercase", marginBottom: 10 }}>{g.label}</div>
                {g.stats.map((st) => (
                  <div key={st.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0" }}>
                    <span style={{ fontSize: 17, color: cssHex(NUTANIX.gray) }}>{st.label}</span>
                    <span style={{ fontSize: 22, fontWeight: 800, color: toneColors(st.tone).color }}>{st.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    case "kpis":
      return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(content.kpis.length, 4)}, 1fr)`, gap: 20 }}>
          {content.kpis.map((k) => (
            <div key={k.label} style={{ border: `1px solid ${cssHex(NUTANIX.mist)}`, borderRadius: 14, background: "#FBFAFF", padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: 46, fontWeight: 800, color: toneColors(k.tone).color }}>{k.value}</div>
              <div style={{ fontSize: 16, color: cssHex(NUTANIX.gray) }}>{k.label}</div>
            </div>
          ))}
        </div>
      );
    case "features":
      return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, height: "100%" }}>
          {content.features.map((f) => {
            const badge = toneColors(f.on ? "good" : "neutral");
            return (
              <div key={f.label} style={{ border: `1px solid ${cssHex(NUTANIX.mist)}`, borderRadius: 14, background: "#FBFAFF", padding: 20, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: cssHex(NUTANIX.ink) }}>{f.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, padding: "4px 12px", borderRadius: 999, background: badge.bg, color: f.on ? cssHex(HEALTH.good) : cssHex(NUTANIX.gray) }}>{f.on ? "ON" : "OFF"}</span>
                </div>
                <span style={{ marginTop: 10, fontSize: 15, color: cssHex(NUTANIX.gray) }}>{f.note}</span>
              </div>
            );
          })}
        </div>
      );
    case "bars":
      return <Bars series={content.series} unit={content.unit} max={content.max} />;
    case "lines":
      return (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
          <LineChart series={content.series} unit={content.unit} />
        </div>
      );
    case "table":
      return (
        <div style={{ height: "100%" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
            <thead>
              <tr>
                {content.columns.map((c) => (
                  <th key={c} style={{ background: cssHex(NUTANIX.purple), color: "#fff", textAlign: "left", padding: "10px 12px", fontWeight: 700 }}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {content.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => {
                    const tone = cellTone(cell);
                    const tc = toneColors(tone);
                    return (
                      <td
                        key={ci}
                        style={{
                          padding: "9px 12px",
                          borderBottom: `1px solid ${cssHex(NUTANIX.line)}`,
                          background: tone ? tc.bg : ri % 2 ? "#F7F6FD" : "#fff",
                          color: tone ? tc.color : cssHex(NUTANIX.ink),
                          fontWeight: tone ? 700 : 400,
                        }}
                      >
                        {cellText(cell)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {content.note ? <div style={{ marginTop: 10, fontSize: 13, fontStyle: "italic", color: cssHex(NUTANIX.slate) }}>{content.note}</div> : null}
        </div>
      );
    default:
      return null;
  }
}

export function QbrSlideBoard({ slide, meta, logo }: { slide: QbrSlide; meta: QbrDeckMeta; logo: string | null }) {
  const isCover = slide.content.type === "title" || slide.content.type === "closing";

  if (isCover) {
    const isTitle = slide.content.type === "title";
    return (
      <div style={{ width: BOARD_W, height: BOARD_H, background: cssHex(NUTANIX.deepPurple), position: "relative", overflow: "hidden", fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif" }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: 320, height: 28, background: cssHex(NUTANIX.purple) }} />
        <div style={{ position: "absolute", top: 0, right: 0, width: 190, height: 55, background: cssHex(NUTANIX.cyan) }} />
        {isTitle ? (
          <div style={{ position: "absolute", inset: "0 0 0 96px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {logo ? <img src={logo} alt="" style={{ height: 72, width: "auto", objectFit: "contain", alignSelf: "flex-start", marginBottom: 28 }} /> : null}
            <div style={{ color: cssHex(NUTANIX.cyan), fontSize: 22, letterSpacing: 4, fontWeight: 600 }}>QUARTERLY BUSINESS REVIEW</div>
            <div style={{ color: "#fff", fontSize: 72, fontWeight: 800, lineHeight: 1.05, marginTop: 12, maxWidth: 980 }}>{meta.customer}</div>
            <div style={{ color: "#D8CCFF", fontSize: 22, marginTop: 22 }}>{meta.vertical} · {meta.dateLabel}</div>
            <div style={{ color: "#B9A7F2", fontSize: 18, marginTop: 6 }}>Prepared by {meta.preparedBy}</div>
          </div>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ color: "#fff", fontSize: 64, fontWeight: 800 }}>{slide.content.type === "closing" ? slide.content.message : ""}</div>
            <div style={{ color: cssHex(NUTANIX.cyan), fontSize: 24, marginTop: 16 }}>{meta.customer}</div>
            {logo ? <img src={logo} alt="" style={{ height: 56, width: "auto", objectFit: "contain", marginTop: 32, filter: "brightness(0) invert(1)" }} /> : null}
          </div>
        )}
      </div>
    );
  }

  const insight = slide.insight;
  return (
    <div style={{ width: BOARD_W, height: BOARD_H, background: "#fff", position: "relative", overflow: "hidden", fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ position: "absolute", left: 48, top: 46, width: 11, height: 56, background: cssHex(NUTANIX.purple), borderRadius: 3 }} />
      <div style={{ position: "absolute", left: 76, top: 40, right: 260 }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: cssHex(NUTANIX.ink), lineHeight: 1.1 }}>{slide.title}</div>
        {slide.subtitle ? <div style={{ fontSize: 17, color: cssHex(NUTANIX.slate), marginTop: 6 }}>{slide.subtitle}</div> : null}
      </div>
      {logo ? <img src={logo} alt="" style={{ position: "absolute", right: 48, top: 46, height: 48, width: "auto", maxWidth: 200, objectFit: "contain" }} /> : null}
      <div style={{ position: "absolute", left: 48, right: 48, top: 130, height: 1, background: cssHex(NUTANIX.line) }} />
      <div style={{ position: "absolute", left: 48, right: 48, top: 152, bottom: insight ? 150 : 84 }}>
        <Content content={slide.content} />
      </div>
      {insight ? (
        (() => {
          const tc = toneColors(insight.tone);
          return (
            <div style={{ position: "absolute", left: 48, right: 48, bottom: 70, background: tc.bg, borderRadius: 12, padding: "14px 20px", display: "flex", gap: 12, alignItems: "center" }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: tc.color, whiteSpace: "nowrap" }}>SE Insight</span>
              <span style={{ fontSize: 16, color: cssHex(NUTANIX.ink) }}>{insight.text}</span>
            </div>
          );
        })()
      ) : null}
      <div style={{ position: "absolute", left: 48, bottom: 28, fontSize: 12, color: cssHex(NUTANIX.slate) }}>Nutanix Confidential · {meta.customer}</div>
    </div>
  );
}

export function QbrSlideFrame({ slide, meta, logo, className }: { slide: QbrSlide; meta: QbrDeckMeta; logo: string | null; className?: string }) {
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
        <QbrSlideBoard slide={slide} meta={meta} logo={logo} />
      </div>
    </div>
  );
}
