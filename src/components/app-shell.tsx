"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Calculator,
  FileSpreadsheet,
  FileText,
  Home,
  Menu,
  NotebookPen,
  Plug,
  Presentation,
  X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Theme } from "@/lib/theme";

const navigation = [
  { href: "/", label: "Home", description: "Tool directory", icon: Home },
  { href: "/note-formatter", label: "Note Formatter", description: "Turn notes into implementation plans", icon: NotebookPen },
  { href: "/simple-sizer", label: "Simple Sizer", description: "Import Collector/RVTools and size quickly", icon: Calculator },
  { href: "/qbr", label: "QBR Deck Builder", description: "Pull CS360 health checks into an on-brand QBR deck", icon: Presentation },
  { href: "/install-base-report", label: "Install Base Report", description: "Merge CS360 exports into a color-coded install base workbook", icon: FileSpreadsheet },
  { href: "/proposal", label: "Proposal Builder", description: "Turn a Sizer scenario into a branded proposal + BOM", icon: FileText },
  { href: "/integrations", label: "Integrations", description: "Connection setup and health checks", icon: Plug },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme: Theme;
}) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  const activeNav = useMemo(() => navigation.find((item) => isActive(pathname, item.href)), [pathname]);

  // Esc closes the drawer (it also closes when a nav link is clicked).
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setNavOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <div className="min-h-screen bg-charcoal-50 text-charcoal-900">
      <header className="sticky top-0 z-30 border-b-2 border-iris-500 bg-charcoal text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3.5 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={navOpen}
              className="flex h-11 w-11 items-center justify-center rounded-md bg-transparent text-white hover:bg-white/10"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold md:text-lg">SE Deal Workspace</h1>
              <p className="truncate text-xs text-white/60">{activeNav?.label ?? "Overview"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle initialTheme={initialTheme} />
            <span className="hidden h-6 w-px bg-white/20 sm:block" aria-hidden />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nutanix-logo-white.png" alt="Nutanix" className="hidden h-4 w-auto shrink-0 sm:block md:h-5" />
          </div>
        </div>
      </header>

      <NavDrawer open={navOpen} pathname={pathname} onClose={() => setNavOpen(false)} />

      <div className="mx-auto max-w-7xl px-4 py-5 md:px-6 md:py-6">
        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}

// Slide-in navigation drawer, styled after the my.nutanix.com hamburger menu:
// dark panel, X to close, a highlighted active item, clean rows.
function NavDrawer({ open, pathname, onClose }: { open: boolean; pathname: string; onClose: () => void }) {
  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-charcoal-900/50 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[300px] max-w-[85vw] flex-col bg-charcoal text-white shadow-2xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ borderTop: "3px solid var(--color-iris-500)" }}
      >
        <div className="flex items-center justify-between px-3 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-white/25 bg-transparent text-white hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nutanix-logo-white.png" alt="Nutanix" className="mr-2 h-4 w-auto" />
        </div>

        <nav className="flex-1 overflow-y-auto px-2 pb-4">
          {navigation.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition ${
                  active ? "bg-white/10 font-semibold text-white" : "text-white/80 hover:bg-white/5 hover:text-white"
                }`}
              >
                {active ? (
                  <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-iris-500" />
                ) : null}
                <Icon className="h-4 w-4 shrink-0 opacity-90" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
