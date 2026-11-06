import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { THEME_COOKIE, resolveTheme, type Theme } from "@/lib/theme";

export const metadata: Metadata = {
  title: "SE Deal Workspace",
  description: "A local, stateless toolkit for Nutanix systems engineers: note formatting, sizing, QBR decks, proposals, and install base reports.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const store = await cookies();
  const theme: Theme = resolveTheme(store.get(THEME_COOKIE)?.value);
  return (
    <html lang="en" className={`h-full antialiased${theme === "dark" ? " dark" : ""}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Loaded globally from the root layout head; eslint page-font rule is a false positive here. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;0,800;1,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full">
        <AppShell initialTheme={theme}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
