"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Calculator,
  CalendarDays,
  FileText,
  LogOut,
  Mail,
  MapPinned,
  Menu,
  NotebookPen,
  Plug,
  Presentation,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { EnvironmentSwitcher } from "@/components/environment-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import type { EnvironmentId } from "@/lib/environment";
import type { Theme } from "@/lib/theme";

export type SessionUser = { email: string; name: string };

const navigation = [
  { href: "/", label: "Account-AI", description: "Per-account knowledge base and assistant", icon: Sparkles },
  { href: "/calendar", label: "Calendar", description: "Meetings, assets, and context", icon: CalendarDays },
  { href: "/deals", label: "Current Deals", description: "Pipeline and build recommendations", icon: Briefcase },
  { href: "/accounts", label: "My Accounts", description: "Customer history, notes, and assets", icon: Users },
  { href: "/account-map", label: "Account Map", description: "Geo coverage by region and SE", icon: MapPinned },
  { href: "/email-memory", label: "Email Memory", description: "Assign inbound context to deals", icon: Mail },
  { href: "/note-formatter", label: "Note Formatter", description: "Turn notes into implementation plans", icon: NotebookPen },
  { href: "/integrations", label: "Integrations", description: "Connection setup and health checks", icon: Plug },
  { href: "/simple-sizer", label: "Simple Sizer", description: "Import Collector/RVTools and size quickly", icon: Calculator },
  { href: "/qbr", label: "QBR Deck Builder", description: "Pull CS360 health checks into an on-brand QBR deck", icon: Presentation },
  { href: "/proposal", label: "Proposal Builder", description: "Turn a Sizer scenario into a branded proposal + BOM", icon: FileText },
];

// Routes that render without the app chrome (their own full-screen layout).
const BARE_ROUTES = new Set(["/login", "/signup"]);

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({
  children,
  initialEnv,
  initialTheme,
  user,
}: {
  children: ReactNode;
  initialEnv: EnvironmentId;
  initialTheme: Theme;
  user: SessionUser | null;
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

  // Auth screens: render the page on its own, no nav.
  if (BARE_ROUTES.has(pathname)) {
    return <>{children}</>;
  }

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
            <EnvironmentSwitcher initialEnv={initialEnv} />
            <ThemeToggle initialTheme={initialTheme} />
            {user ? <UserMenu user={user} /> : null}
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

// Avatar button + dropdown showing the signed-in user and a logout action.
function UserMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const initials = useMemo(() => {
    const parts = user.name.trim().split(/\s+/).filter(Boolean);
    const letters = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0]?.[0] ?? user.email[0]);
    return letters.toUpperCase();
  }, [user]);

  const logout = async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/login");
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-iris-500 text-xs font-semibold text-white hover:bg-iris-600"
      >
        {initials}
      </button>
      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent p-0"
          />
          <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-lg border border-charcoal-200 bg-white text-charcoal-900 shadow-lg">
            <div className="border-b border-charcoal-100 px-3 py-2.5">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-charcoal-500">{user.email}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              disabled={loggingOut}
              className="flex w-full items-center gap-2 bg-white px-3 py-2.5 text-left text-sm font-medium text-charcoal-800 hover:bg-charcoal-50 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4" /> {loggingOut ? "Logging out…" : "Log out"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
