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
    <section className="rounded-xl border border-charcoal-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-charcoal-900">{title}</h2>
        {subtitle ? <p className="text-sm text-charcoal-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-base font-semibold text-charcoal-900">{title}</h3>
        {subtitle ? <p className="text-sm text-charcoal-500">{subtitle}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-charcoal-300 bg-charcoal-50 px-4 py-8 text-center">
      <p className="text-sm font-semibold text-charcoal-700">{title}</p>
      <p className="mt-1 text-sm text-charcoal-500">{description}</p>
    </div>
  );
}

export function FormRow({
  label,
  htmlFor,
  helper,
  children,
}: {
  label: string;
  htmlFor: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {helper ? <p className="text-xs text-charcoal-500">{helper}</p> : null}
    </div>
  );
}

export function ActionBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-t border-charcoal-200 pt-3">{children}</div>;
}

export function StatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warning" | "bad";
}) {
  const toneClass = {
    neutral: "bg-charcoal-100 text-charcoal-700",
    good: "bg-[#eef8d8] text-[#3f5e0a]",
    warning: "bg-[#ffe7e0] text-[#9a3b27]",
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

export function Button({
  children,
  tone = "primary",
  type = "button",
}: {
  children: ReactNode;
  tone?: "primary" | "secondary" | "danger";
  type?: "button" | "submit" | "reset";
}) {
  const toneClass = {
    primary: "bg-iris-500 text-white hover:bg-iris-600",
    secondary: "bg-white text-charcoal-800 border border-charcoal-300 hover:bg-charcoal-50",
    danger: "bg-rose-600 text-white hover:bg-rose-500",
  }[tone];

  return (
    <button type={type} className={`rounded-md px-3 py-2 text-sm font-medium transition ${toneClass}`}>
      {children}
    </button>
  );
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
