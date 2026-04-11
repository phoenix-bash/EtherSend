"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthSession } from "../hooks/use-auth-session";
import { useThemeMode } from "../hooks/use-theme";

interface ControlShellProps {
  children: ReactNode;
  searchPlaceholder?: string;
  showGuestBanner?: boolean;
  plainHeader?: boolean;
}

const navItems = [
  { href: "/", label: "HOME", icon: "home" },
  { href: "/notifications", label: "Notifications", icon: "notifications" },
  { href: "/library", label: "Media Library", icon: "folder_open" },
  { href: "/batches", label: "Batches", icon: "layers" },
  { href: "/account", label: "Account", icon: "account_circle" }
];

function matchesRoute(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function getUserInitial(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "U";
  }

  return trimmed[0].toUpperCase();
}

export function ControlShell({ children, searchPlaceholder = "SEARCH ASSETS OR BATCHES...", showGuestBanner = false, plainHeader = false }: ControlShellProps) {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuthSession();
  const { theme, toggleTheme } = useThemeMode();

  const guestBannerVisible = showGuestBanner && !loading && !user;
  const profileLabel = user?.name || user?.email || "Guest";
  const notificationsActive = matchesRoute(pathname, "/notifications");

  return (
    <div className="min-h-screen bg-background text-on-background">
      {guestBannerVisible ? (
        <div className="fixed left-0 right-0 top-0 z-50 flex h-10 items-center justify-center gap-3 border-b border-secondary/20 bg-secondary-container/30 px-4">
          <span className="material-symbols-outlined text-sm text-secondary">info</span>
          <p className="text-[10px] font-label font-semibold uppercase tracking-widest text-on-surface">
            Guest mode active: session expires per policy
          </p>
          <Link href="/auth/signin" className="rounded-lg bg-secondary px-3 py-1 text-[10px] font-label uppercase tracking-tighter text-on-secondary transition-all hover:brightness-110">
            Sign up to persist
          </Link>
        </div>
      ) : null}

      <aside className="fixed left-0 top-0 z-40 hidden h-full w-64 flex-col border-r border-outline-variant/20 bg-surface-container-low/85 backdrop-blur-xl md:flex">
        <div className="p-8">
          <h1 className="font-headline text-xl font-bold tracking-tight text-on-surface">LinkForge</h1>
          <p className="mt-1 text-[10px] font-label uppercase tracking-[0.2em] text-on-surface-variant">Asset Intelligence</p>
        </div>

        <nav className="mt-2 flex-1 space-y-1.5 px-4">
          {navItems.map((item) => {
            const active = matchesRoute(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-4 px-4 py-3 transition-all duration-200 ${
                  active
                    ? "rounded-lg border border-primary/30 bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(75,188,214,0.18)]"
                    : "rounded-lg text-on-surface-variant hover:bg-surface-container-high/40 hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className="text-xs font-label uppercase tracking-wider">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-outline-variant/15 p-4">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-on-surface-variant transition-all duration-200 hover:bg-surface-container-high/40 hover:text-on-surface"
            aria-label="Toggle color theme"
          >
            <span className="material-symbols-outlined text-base">{theme === "dark" ? "light_mode" : "dark_mode"}</span>
            <span className="text-xs font-label uppercase tracking-wider">Theme: {theme === "dark" ? "Light" : "Dark"}</span>
          </button>

          {user ? (
            <button
              type="button"
              className="flex w-full items-center gap-4 rounded-lg px-4 py-3 text-on-surface-variant transition-all duration-200 hover:bg-surface-container-high/40 hover:text-on-surface"
              onClick={() => {
                void signOut();
              }}
            >
              <span className="material-symbols-outlined text-base text-error">logout</span>
              <span className="text-xs font-label uppercase tracking-wider text-error/80">Logout</span>
            </button>
          ) : (
            <Link
              href="/auth/signin"
              className="flex items-center gap-4 rounded-lg px-4 py-3 text-on-surface-variant transition-all duration-200 hover:bg-surface-container-high/40 hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-base">login</span>
              <span className="text-xs font-label uppercase tracking-wider">Sign in</span>
            </Link>
          )}
        </div>
      </aside>

      <header
        className={`fixed left-0 right-0 z-30 flex h-16 items-center justify-between border-b border-outline-variant/20 px-4 md:left-64 md:px-8 ${
          plainHeader ? "bg-surface-container-low" : "bg-surface-container-low/80 backdrop-blur-2xl"
        } ${
          guestBannerVisible ? "top-10" : "top-0"
        }`}
      >
        <div className="w-full max-w-xl">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-sm text-on-surface-variant">search</span>
            <input
              type="text"
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest py-2.5 pl-10 pr-4 text-xs font-label text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0"
            />
          </div>
        </div>

        <div className="ml-6 flex items-center gap-4">
          <Link
            href="/notifications"
            className={`relative transition-colors ${notificationsActive ? "text-primary" : "text-on-surface-variant hover:text-primary"}`}
            aria-label="notifications"
          >
            <span className="material-symbols-outlined">notifications</span>
            <span className="absolute right-0 top-0 h-2 w-2 rounded-full border border-background bg-primary"></span>
          </Link>

          <div className="hidden items-center gap-3 border-l border-outline-variant/20 pl-4 sm:flex">
            <div className="text-right">
              <p className="text-xs font-bold uppercase tracking-tighter text-on-surface">{loading ? "Checking session" : profileLabel}</p>
              <p className="text-[10px] uppercase tracking-tighter text-on-surface-variant">{user ? "Authenticated" : "Guest mode"}</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/20 bg-surface-container-low text-xs font-bold text-primary">
              {getUserInitial(profileLabel)}
            </div>
          </div>
        </div>
      </header>

      <main className={`min-h-screen px-4 pb-10 md:ml-64 md:px-8 ${guestBannerVisible ? "pt-28" : "pt-20"}`}>
        <div className="mx-auto w-full max-w-[1320px]">{children}</div>
      </main>
    </div>
  );
}