import Link from "next/link";
import { ReactNode } from "react";

const navigation = [
  { href: "/", label: "Calendar" },
  { href: "/deals", label: "Current Deals" },
  { href: "/email-memory", label: "Email Memory" },
  { href: "/integrations", label: "Integrations" },
  { href: "/qbr", label: "QBR Deck Builder" },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Nutanix SE Workspace</p>
            <h1 className="text-lg font-semibold">SE Deal Workspace</h1>
          </div>
          <p className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
            Foundation Wave 1
          </p>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[240px_1fr]">
        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-3">
          <nav className="flex flex-col gap-1">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}
