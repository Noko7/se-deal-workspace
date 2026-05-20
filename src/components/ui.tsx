import { IntegrationStatus, PreviewStatus, RecommendationDecision } from "@prisma/client";
import { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warning" | "bad";
}) {
  const toneClass = {
    neutral: "bg-slate-100 text-slate-700",
    good: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-900",
    bad: "bg-rose-100 text-rose-800",
  }[tone];

  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>{children}</span>;
}

export function IntegrationStatusPill({ status }: { status: IntegrationStatus }) {
  const tone =
    status === IntegrationStatus.CONNECTED ? "good" : status === IntegrationStatus.NEEDS_ATTENTION ? "warning" : "neutral";
  return <StatusPill tone={tone}>{status.replace("_", " ")}</StatusPill>;
}

export function PreviewStatusPill({ status }: { status: PreviewStatus }) {
  const tone = status === PreviewStatus.READY ? "good" : status === PreviewStatus.PENDING ? "warning" : "bad";
  return <StatusPill tone={tone}>{status}</StatusPill>;
}

export function RecommendationStatusPill({ status }: { status: RecommendationDecision }) {
  const tone =
    status === RecommendationDecision.APPROVED
      ? "good"
      : status === RecommendationDecision.REJECTED
        ? "bad"
        : "warning";

  return <StatusPill tone={tone}>{status}</StatusPill>;
}
