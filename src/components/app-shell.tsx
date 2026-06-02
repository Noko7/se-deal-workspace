"use client";

import Link from "next/link";
import { ReactNode, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Briefcase, CalendarDays, Mail, MapPinned, Plug, Presentation, Users } from "lucide-react";

const navigation = [
  { href: "/", label: "Calendar", description: "Meetings, assets, and context", icon: CalendarDays },
  { href: "/deals", label: "Current Deals", description: "Pipeline and build recommendations", icon: Briefcase },
  { href: "/accounts", label: "My Accounts", description: "Customer history, notes, and assets", icon: Users },
  { href: "/account-map", label: "Account Map", description: "Geo coverage by region and SE", icon: MapPinned },
  { href: "/email-memory", label: "Email Memory", description: "Assign inbound context to deals", icon: Mail },
  { href: "/integrations", label: "Integrations", description: "Connection setup and health checks", icon: Plug },
  { href: "/qbr", label: "QBR Deck Builder", description: "Prep checklists and deck workflow", icon: Presentation },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const activeNav = useMemo(
    () => navigation.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))),
    [pathname],
  );

  return (
    <div className="min-h-screen bg-charcoal-50 text-charcoal-900">
      <header className="sticky top-0 z-20 border-b-2 border-iris-500 bg-charcoal text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/nutanix-logo.png"
              alt="Nutanix"
              className="h-4 w-auto shrink-0 md:h-5"
            />
            <span className="hidden h-6 w-px bg-white/20 sm:block" aria-hidden />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold md:text-lg">SE Deal Workspace</h1>
              <p className="truncate text-xs text-white/60">Active section: {activeNav?.label ?? "Overview"}</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <p className="rounded-full bg-iris-500 px-3 py-1 text-xs font-medium text-white">Env: Foundation</p>
            <p className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/80">Service: Healthy</p>
          </div>
          <button
            type="button"
            className="rounded-md border border-white/30 bg-transparent px-3 py-2 text-xs font-medium text-white hover:bg-white/10 md:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-4 md:gap-6 md:px-6 md:py-6 md:grid-cols-[280px_1fr]">
        <aside className={`${open ? "block" : "hidden"} h-fit rounded-xl border border-charcoal-200 border-t-4 border-t-iris-500 bg-white p-3 md:block`}>
          <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-iris-600">Navigation</p>
          <nav className="flex flex-col gap-1">
            {navigation.map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-start gap-3 rounded-md px-3 py-2 transition ${
                    isActive
                      ? "bg-iris-500 text-white shadow-sm"
                      : "text-charcoal-700 hover:bg-iris-50"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                      isActive ? "bg-white/20 text-white" : "bg-iris-50 text-iris-600"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className={`block text-xs ${isActive ? "text-iris-100" : "text-charcoal-500"}`}>
                      {item.description}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}
