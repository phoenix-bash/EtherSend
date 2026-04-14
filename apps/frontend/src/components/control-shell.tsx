"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuthSession } from "../hooks/use-auth-session";
import { useThemeMode } from "../hooks/use-theme";
import { listActivity, listBatches, listMedia, type BatchListItem, type MediaItem } from "../lib/api-client";
import { SIGNED_OUT_EVENT, SYSTEM_LOG_EVENT } from "../lib/events";
import { getOrCreateGuestPokemonAlias, rotateGuestPokemonAlias } from "../lib/guest-alias";

interface ControlShellProps {
  children: ReactNode;
  searchPlaceholder?: string;
  showGuestBanner?: boolean;
  plainHeader?: boolean;
}

interface SearchSuggestion {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: string;
}

interface SearchPageTarget {
  href: string;
  label: string;
  description: string;
  keywords: string[];
}

const navItems = [
  { href: "/", label: "HOME", icon: "home" },
  { href: "/notifications", label: "Notifications", icon: "notifications" },
  { href: "/library", label: "Media Library", icon: "folder_open" },
  { href: "/batches", label: "Batches", icon: "layers" },
  { href: "/account", label: "Account", icon: "account_circle" }
];

const searchPageTargets: SearchPageTarget[] = [
  {
    href: "/",
    label: "System Overview",
    description: "Home dashboard and media archive console.",
    keywords: ["home", "dashboard", "overview", "upload", "archive"]
  },
  {
    href: "/library",
    label: "Media Library",
    description: "Browse uploaded files and previews.",
    keywords: ["media", "library", "uploaded", "assets", "files"]
  },
  {
    href: "/batches",
    label: "Batches",
    description: "Open and manage batch shares.",
    keywords: ["batch", "share", "download", "qr"]
  },
  {
    href: "/account",
    label: "Account",
    description: "Security and profile settings.",
    keywords: ["account", "settings", "profile", "security", "plan"]
  },
  {
    href: "/notifications",
    label: "Notifications",
    description: "System event feed and logs.",
    keywords: ["notifications", "logs", "events", "activity"]
  }
];

const LAST_SEEN_ACTIVITY_KEY = "ethersend:last-seen-activity-at";
const DESKTOP_NAV_COLLAPSED_KEY = "ethersend:desktop-nav-collapsed";

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

function normalizeSearchValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Timed out"));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function formatBatchName(batch: BatchListItem): string {
  if (batch.name && batch.name.trim().length > 0) {
    return batch.name;
  }

  return `Batch ${batch.id.slice(0, 8)}`;
}

export function ControlShell({ children, searchPlaceholder = "SEARCH ASSETS OR BATCHES...", showGuestBanner = false, plainHeader = false }: ControlShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get("q") ?? "";
  const { user, loading, signOut } = useAuthSession();
  const { theme, toggleTheme } = useThemeMode();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchMedia, setSearchMedia] = useState<MediaItem[]>([]);
  const [searchBatches, setSearchBatches] = useState<BatchListItem[]>([]);
  const [searchIndexLoaded, setSearchIndexLoaded] = useState(false);
  const [searchIndexLoading, setSearchIndexLoading] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [desktopNavCollapsed, setDesktopNavCollapsed] = useState(false);
  const [guestAlias, setGuestAlias] = useState("Guest");
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const desktopSearchFormRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchFormRef = useRef<HTMLDivElement | null>(null);
  const searchToggleButtonRef = useRef<HTMLButtonElement | null>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const latestActivityMsRef = useRef(0);

  const guestBannerVisible = showGuestBanner && !loading && !user;
  const profileLabel = user?.name || user?.email || guestAlias;
  const notificationsActive = matchesRoute(pathname, "/notifications");
  const onNotificationsPage = notificationsActive;
  const normalizedSearch = normalizeSearchValue(searchValue);
  const normalizedSearchLower = normalizedSearch.toLowerCase();

  function readLastSeenActivityMs(): number {
    if (typeof window === "undefined") {
      return 0;
    }

    const raw = window.localStorage.getItem(LAST_SEEN_ACTIVITY_KEY);
    if (raw === null) {
      const now = Date.now();
      window.localStorage.setItem(LAST_SEEN_ACTIVITY_KEY, String(now));
      return now;
    }

    const parsed = Number(raw ?? "0");
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function writeLastSeenActivityMs(value: number): void {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(LAST_SEEN_ACTIVITY_KEY, String(value));
  }

  useEffect(() => {
    setMobileNavOpen(false);
    setSuggestionsOpen(false);
    if (pathname !== "/search") {
      setSearchExpanded(false);
    }
  }, [pathname]);

  useEffect(() => {
    const raw = window.localStorage.getItem(DESKTOP_NAV_COLLAPSED_KEY);
    setDesktopNavCollapsed(raw === "1");
  }, []);

  useEffect(() => {
    if (user) {
      return;
    }

    setGuestAlias(getOrCreateGuestPokemonAlias());
  }, [user]);

  useEffect(() => {
    if (pathname !== "/search") {
      return;
    }

    setSearchValue(searchQuery);
    setSearchExpanded(Boolean(searchQuery.trim()));
  }, [pathname, searchQuery]);

  useEffect(() => {
    if (!searchExpanded) {
      return;
    }

    const isMobileViewport = window.matchMedia("(max-width: 767px)").matches;
    if (isMobileViewport) {
      mobileSearchInputRef.current?.focus();
      return;
    }

    desktopSearchInputRef.current?.focus();
  }, [searchExpanded]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent): void {
      const target = event.target;
      if (!target || !(target instanceof Node)) {
        return;
      }

      const insideDesktopSearch = desktopSearchFormRef.current?.contains(target) ?? false;
      const insideMobileSearch = mobileSearchFormRef.current?.contains(target) ?? false;
      const insideSearchToggle = searchToggleButtonRef.current?.contains(target) ?? false;

      if (!insideDesktopSearch && !insideMobileSearch && !insideSearchToggle) {
        setSuggestionsOpen(false);
        setSearchExpanded(false);
      }
    }

    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onEscape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    }

    window.addEventListener("keydown", onEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onEscape);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    function onEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }

      setSuggestionsOpen(false);
      setSearchExpanded(false);
    }

    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

  useEffect(() => {
    if (!suggestionsOpen || !normalizedSearchLower || searchIndexLoaded || searchIndexLoading) {
      return;
    }

    setSearchIndexLoading(true);

    async function loadSearchIndex(): Promise<void> {
      const [mediaResult, batchResult] = await Promise.allSettled([
        withTimeout(listMedia(), 2600),
        withTimeout(listBatches(), 2600)
      ]);

      setSearchMedia(mediaResult.status === "fulfilled" ? mediaResult.value.items : []);
      setSearchBatches(batchResult.status === "fulfilled" ? batchResult.value.items : []);
      setSearchIndexLoaded(true);
      setSearchIndexLoading(false);
    }

    void loadSearchIndex().catch(() => {
      setSearchMedia([]);
      setSearchBatches([]);
      setSearchIndexLoaded(true);
      setSearchIndexLoading(false);
    });
  }, [normalizedSearchLower, searchIndexLoaded, searchIndexLoading, suggestionsOpen]);

  useEffect(() => {
    if (!onNotificationsPage) {
      return;
    }

    const seenAt = Math.max(Date.now(), latestActivityMsRef.current);
    writeLastSeenActivityMs(seenAt);
    setHasUnreadNotifications(false);
  }, [onNotificationsPage]);

  useEffect(() => {
    let disposed = false;

    async function refreshUnreadState(): Promise<void> {
      try {
        const result = await listActivity(20);
        if (disposed) {
          return;
        }

        const latestServerActivityMs = result.items.reduce((latestMs, item) => {
          return Math.max(latestMs, new Date(item.createdAt).getTime());
        }, 0);

        latestActivityMsRef.current = Math.max(latestActivityMsRef.current, latestServerActivityMs);

        if (onNotificationsPage) {
          const seenAt = Math.max(readLastSeenActivityMs(), latestActivityMsRef.current, Date.now());
          writeLastSeenActivityMs(seenAt);
          setHasUnreadNotifications(false);
          return;
        }

        setHasUnreadNotifications(latestActivityMsRef.current > readLastSeenActivityMs());
      } catch {
        if (!disposed && !onNotificationsPage) {
          setHasUnreadNotifications(latestActivityMsRef.current > readLastSeenActivityMs());
        }
      }
    }

    void refreshUnreadState();

    const intervalId = window.setInterval(() => {
      void refreshUnreadState();
    }, 20000);

    function onSystemLogActivity(): void {
      latestActivityMsRef.current = Date.now();

      if (onNotificationsPage) {
        writeLastSeenActivityMs(latestActivityMsRef.current);
        setHasUnreadNotifications(false);
        return;
      }

      setHasUnreadNotifications(true);
    }

    function onSignedOut(): void {
      latestActivityMsRef.current = 0;
      setHasUnreadNotifications(false);
      writeLastSeenActivityMs(Date.now());
      setGuestAlias(rotateGuestPokemonAlias());
    }

    window.addEventListener(SYSTEM_LOG_EVENT, onSystemLogActivity);
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener(SYSTEM_LOG_EVENT, onSystemLogActivity);
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
    };
  }, [onNotificationsPage]);

  const suggestions = useMemo<SearchSuggestion[]>(() => {
    if (!normalizedSearchLower) {
      return [];
    }

    const pageMatches = searchPageTargets
      .filter((item) => `${item.label} ${item.description} ${item.keywords.join(" ")}`.toLowerCase().includes(normalizedSearchLower))
      .slice(0, 4)
      .map((item) => ({
        id: `page-${item.href}`,
        label: item.label,
        description: item.description,
        href: item.href,
        icon: "travel_explore"
      }));

    const mediaMatches = searchMedia
      .filter((item) => `${item.filename} ${item.mimeType}`.toLowerCase().includes(normalizedSearchLower))
      .slice(0, 4)
      .map((item) => ({
        id: `media-${item.id}`,
        label: item.filename,
        description: `${item.mimeType} • Open in Media Library`,
        href: `/library?mediaId=${encodeURIComponent(item.id)}&q=${encodeURIComponent(item.filename)}`,
        icon: "perm_media"
      }));

    const batchMatches = searchBatches
      .filter((item) => `${formatBatchName(item)} ${item.id}`.toLowerCase().includes(normalizedSearchLower))
      .slice(0, 4)
      .map((item) => ({
        id: `batch-${item.id}`,
        label: formatBatchName(item),
        description: `${item.fileCount} file(s) • Open in Batches`,
        href: `/batches?batchId=${encodeURIComponent(item.id)}&q=${encodeURIComponent(formatBatchName(item))}`,
        icon: "layers"
      }));

    return [
      {
        id: "search-all",
        label: `Search all for "${normalizedSearch}"`,
        description: "Open full search results page",
        href: `/search?q=${encodeURIComponent(normalizedSearch)}`,
        icon: "search"
      },
      ...pageMatches,
      ...mediaMatches,
      ...batchMatches
    ].slice(0, 10);
  }, [normalizedSearch, normalizedSearchLower, searchBatches, searchMedia]);

  function submitSearch(): void {
    if (!normalizedSearch) {
      setSuggestionsOpen(false);
      setSearchExpanded(false);
      router.push("/search");
      return;
    }

    setSuggestionsOpen(false);
    setSearchExpanded(false);
    router.push(`/search?q=${encodeURIComponent(normalizedSearch)}`);
  }

  function toggleSearch(): void {
    if (searchExpanded) {
      setSuggestionsOpen(false);
      setSearchExpanded(false);
      return;
    }

    setSearchExpanded(true);
    if (normalizedSearch) {
      setSuggestionsOpen(true);
    }
  }

  function toggleDesktopNavCollapsed(): void {
    setDesktopNavCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(DESKTOP_NAV_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="glass-site min-h-screen bg-background text-on-background">
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

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-[60] animate-[ui-fade-in_220ms_ease-out] md:hidden" role="dialog" aria-modal="true" aria-label="Mobile navigation menu">
          <button
            type="button"
            className="absolute inset-0 border-0 bg-[rgb(10_12_18_/_0.26)]"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation menu"
            style={{ borderRadius: 0 }}
          />
          <aside className="relative flex h-full w-[84vw] max-w-[320px] animate-[ui-slide-in-left_260ms_ease-out] flex-col border-r border-outline-variant/35 bg-surface-container/92 p-3 shadow-2xl backdrop-blur-2xl dark:bg-surface-container-high/88">
            <div className="mb-5 flex items-start justify-between gap-3">
              <Link href="/" className="block">
                <h1 className="font-headline text-lg font-bold tracking-tight text-on-surface">EtherSend</h1>
                <p className="mt-1 text-[10px] font-label uppercase tracking-[0.2em] text-on-surface-variant">Asset Intelligence</p>
              </Link>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-[0.425rem] border border-outline-variant/30 bg-surface-container-highest/70 text-on-surface-variant transition-colors hover:border-outline-variant/45 hover:text-on-surface"
                aria-label="Close mobile menu"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <nav className="space-y-1.5">
              {navItems.map((item) => {
                const active = matchesRoute(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-option flex items-center gap-3 rounded-[0.425rem] px-3 py-2.5 transition-colors ${
                      active
                        ? "border border-primary/35 bg-primary/14 text-primary"
                        : "border border-outline-variant/25 bg-surface-container-low/55 text-on-surface hover:border-outline-variant/40 hover:bg-surface-container-high/70"
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">{item.icon}</span>
                    <span className="text-xs font-label uppercase tracking-wider">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto space-y-1 border-t border-outline-variant/15 pt-3">
              <button
                type="button"
                onClick={toggleTheme}
                className="nav-option flex w-full items-center gap-3 rounded-[0.425rem] border border-outline-variant/25 bg-surface-container-low/55 px-3 py-2.5 text-on-surface transition-colors hover:border-outline-variant/40 hover:bg-surface-container-high/70"
                aria-label="Toggle color theme"
              >
                <span className="material-symbols-outlined text-base">{theme === "dark" ? "dark_mode" : "light_mode"}</span>
                <span className="text-xs font-label uppercase tracking-wider">Theme: {theme === "dark" ? "Dark" : "Light"}</span>
              </button>

              {user ? (
                <button
                  type="button"
                  className="nav-option flex w-full items-center gap-3 rounded-[0.425rem] border border-outline-variant/25 bg-surface-container-low/55 px-3 py-2.5 text-on-surface transition-colors hover:border-outline-variant/40 hover:bg-surface-container-high/70"
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
                  className="nav-option flex items-center gap-3 rounded-[0.425rem] border border-outline-variant/25 bg-surface-container-low/55 px-3 py-2.5 text-on-surface transition-colors hover:border-outline-variant/40 hover:bg-surface-container-high/70"
                >
                  <span className="material-symbols-outlined text-base">login</span>
                  <span className="text-xs font-label uppercase tracking-wider">Sign in</span>
                </Link>
              )}
            </div>
          </aside>
        </div>
      ) : null}

      <aside
        className={`fixed left-0 top-0 z-40 hidden h-full flex-col border-r border-outline-variant/20 bg-surface-container-low/62 backdrop-blur-xl transition-[width] duration-300 md:flex ${
          desktopNavCollapsed ? "w-[4.5rem]" : "w-64"
        }`}
      >
        <div className={desktopNavCollapsed ? "p-3" : "p-6"}>
          <div className={`flex items-start ${desktopNavCollapsed ? "flex-col items-center gap-2" : "justify-between gap-3"}`}>
            <Link href="/" className={desktopNavCollapsed ? "inline-flex" : "block"} aria-label="Go to home">
              {desktopNavCollapsed ? (
                <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-xl border border-primary/30 bg-primary/10">
                  <img src="/Media_Assets/EtherSend.png" alt="EtherSend logo" className="h-6 w-6 object-contain" />
                </span>
              ) : (
                <>
                  <h1 className="font-headline text-xl font-bold tracking-tight text-on-surface">EtherSend</h1>
                  <p className="mt-1 text-[10px] font-label uppercase tracking-[0.2em] text-on-surface-variant">Asset Intelligence</p>
                </>
              )}
            </Link>
            <button
              type="button"
              className="grid h-8 w-8 place-items-center rounded-full border border-outline-variant/20 bg-surface-container text-on-surface-variant transition-colors hover:text-primary"
              onClick={toggleDesktopNavCollapsed}
              aria-label={desktopNavCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={desktopNavCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className="material-symbols-outlined text-base">{desktopNavCollapsed ? "chevron_right" : "chevron_left"}</span>
            </button>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-1.5 px-3">
          {navItems.map((item) => {
            const active = matchesRoute(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-option group flex items-center py-2.5 transition-all duration-200 ${
                  desktopNavCollapsed ? "justify-center px-0" : "gap-3 px-3"
                } ${
                  active
                    ? "rounded-lg border border-primary/30 bg-primary/10 text-primary shadow-[inset_0_0_0_1px_rgba(75,188,214,0.12)]"
                    : "rounded-lg text-on-surface-variant hover:bg-surface-container-high/40 hover:text-on-surface"
                }`}
                title={desktopNavCollapsed ? item.label : undefined}
                aria-label={item.label}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className={desktopNavCollapsed ? "hidden" : "text-xs font-label uppercase tracking-wider"}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-outline-variant/15 p-3">
          <button
            type="button"
            onClick={toggleTheme}
            className={`nav-option flex w-full items-center rounded-lg py-2.5 text-on-surface-variant transition-all duration-200 hover:bg-surface-container-high/40 hover:text-on-surface ${
              desktopNavCollapsed ? "justify-center px-0" : "gap-3 px-3"
            }`}
            aria-label="Toggle color theme"
            title={desktopNavCollapsed ? "Toggle color theme" : undefined}
          >
            <span className="material-symbols-outlined text-base">{theme === "dark" ? "dark_mode" : "light_mode"}</span>
            <span className={desktopNavCollapsed ? "hidden" : "text-xs font-label uppercase tracking-wider"}>Theme: {theme === "dark" ? "Dark" : "Light"}</span>
          </button>

          {user ? (
            <button
              type="button"
              className={`nav-option flex w-full items-center rounded-lg py-2.5 text-on-surface-variant transition-all duration-200 hover:bg-surface-container-high/40 hover:text-on-surface ${
                desktopNavCollapsed ? "justify-center px-0" : "gap-3 px-3"
              }`}
              onClick={() => {
                void signOut();
              }}
              aria-label="Logout"
              title={desktopNavCollapsed ? "Logout" : undefined}
            >
              <span className="material-symbols-outlined text-base text-error">logout</span>
              <span className={desktopNavCollapsed ? "hidden" : "text-xs font-label uppercase tracking-wider text-error/80"}>Logout</span>
            </button>
          ) : (
            <Link
              href="/auth/signin"
              className={`nav-option flex items-center rounded-lg py-2.5 text-on-surface-variant transition-all duration-200 hover:bg-surface-container-high/40 hover:text-on-surface ${
                desktopNavCollapsed ? "justify-center px-0" : "gap-3 px-3"
              }`}
              title={desktopNavCollapsed ? "Sign in" : undefined}
              aria-label="Sign in"
            >
              <span className="material-symbols-outlined text-base">login</span>
              <span className={desktopNavCollapsed ? "hidden" : "text-xs font-label uppercase tracking-wider"}>Sign in</span>
            </Link>
          )}
        </div>
      </aside>

      <header
        className={`fixed left-0 right-0 z-30 flex h-14 items-center justify-between border-b border-outline-variant/20 px-3 md:px-6 ${
          desktopNavCollapsed ? "md:left-[4.5rem]" : "md:left-64"
        } ${
          plainHeader ? "bg-surface-container-low/75 backdrop-blur-2xl" : "bg-surface-container-low/80 backdrop-blur-2xl"
        } ${
          guestBannerVisible ? "top-10" : "top-0"
        }`}
      >
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg border border-outline-variant/20 bg-surface-container-low text-on-surface md:hidden"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation menu"
          >
            <span className="material-symbols-outlined text-lg">menu</span>
          </button>

          <Link
            href="/"
            className={`font-headline text-base font-bold tracking-tight text-on-surface md:hidden ${searchExpanded ? "hidden" : ""}`}
          >
            EtherSend
          </Link>
        </div>

        <div
          ref={desktopSearchFormRef}
          className={`ml-2 mr-4 hidden min-w-0 flex-1 origin-right overflow-visible transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:block ${
            searchExpanded ? "max-w-full translate-x-0 opacity-100" : "pointer-events-none max-w-0 translate-x-2 opacity-0"
          }`}
        >
          <div className={searchExpanded ? "animate-[ui-search-expand_260ms_ease-out]" : ""}>
            <form
              className="relative h-9"
              onSubmit={(event) => {
                event.preventDefault();
                submitSearch();
              }}
            >
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-on-surface-variant">search</span>
              <input
                ref={desktopSearchInputRef}
                type="text"
                value={searchValue}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  const normalized = normalizeSearchValue(nextValue);
                  setSearchValue(nextValue);
                  setSuggestionsOpen(Boolean(normalized));
                }}
                onFocus={() => {
                  if (normalizeSearchValue(searchValue)) {
                    setSuggestionsOpen(true);
                  }
                }}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-lg border border-outline-variant/35 bg-surface-container-lowest pl-10 pr-12 text-xs font-label text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0"
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md border border-outline-variant/35 bg-surface-container-high text-on-surface-variant transition-colors hover:border-primary/45 hover:text-on-surface"
                aria-label="Run search"
              >
                <span className="material-symbols-outlined text-sm">north_east</span>
              </button>
            </form>

            {suggestionsOpen && normalizedSearch ? (
              <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-lg border border-outline-variant/35 bg-[rgb(244_249_255_/_0.96)] shadow-lg backdrop-blur-xl dark:bg-[rgb(22_30_41_/_0.84)] animate-[ui-fade-in_180ms_ease-out]">
                {suggestions.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-on-surface-variant">No matching suggestions. Press Enter to search all results.</p>
                ) : null}

                {suggestions.length > 0 ? (
                  <ul className="max-h-72 overflow-y-auto py-1">
                    {suggestions.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={item.href}
                          className="flex items-start gap-2.5 px-3 py-1.5 transition-colors hover:bg-surface-container-high/60"
                          onClick={() => {
                            setSuggestionsOpen(false);
                            setSearchExpanded(false);
                          }}
                        >
                          <span className="material-symbols-outlined mt-0.5 text-base text-primary/80">{item.icon}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-semibold text-on-surface">{item.label}</span>
                            <span className="block truncate text-[10px] text-on-surface-variant">{item.description}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {searchIndexLoading ? (
                  <p className="border-t border-outline-variant/15 px-3 py-1.5 text-[10px] uppercase tracking-wider text-on-surface-variant">Syncing file suggestions...</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {searchExpanded ? (
          <div
            ref={mobileSearchFormRef}
            className="absolute inset-y-0 left-[3.45rem] right-[3.75rem] z-40 flex items-center md:hidden"
          >
            <div className="w-full animate-[ui-search-expand_260ms_ease-out]">
              <form
                className="relative h-9"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitSearch();
                }}
              >
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-sm text-on-surface-variant">search</span>
                <input
                  ref={mobileSearchInputRef}
                  type="text"
                  value={searchValue}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    const normalized = normalizeSearchValue(nextValue);
                    setSearchValue(nextValue);
                    setSuggestionsOpen(Boolean(normalized));
                  }}
                  onFocus={() => {
                    if (normalizeSearchValue(searchValue)) {
                      setSuggestionsOpen(true);
                    }
                  }}
                  placeholder={searchPlaceholder}
                  className="h-9 w-full rounded-full border border-outline-variant/35 bg-[rgb(250_252_255_/_0.98)] pl-9 pr-[4.9rem] text-xs font-label text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0 dark:bg-[rgb(27_37_50_/_0.94)]"
                />
                <button
                  type="submit"
                  className="absolute right-9 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-outline-variant/35 bg-[rgb(243_247_253_/_0.98)] text-on-surface-variant transition-colors hover:border-primary/45 hover:text-on-surface dark:bg-[rgb(33_45_60_/_0.94)]"
                  aria-label="Run search"
                >
                  <span className="material-symbols-outlined text-[15px]">search</span>
                </button>
                <button
                  type="button"
                  className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-outline-variant/35 bg-[rgb(243_247_253_/_0.98)] text-on-surface-variant transition-colors hover:border-primary/45 hover:text-on-surface dark:bg-[rgb(33_45_60_/_0.94)]"
                  onClick={() => {
                    setSuggestionsOpen(false);
                    setSearchExpanded(false);
                  }}
                  aria-label="Close search"
                >
                  <span className="material-symbols-outlined text-[15px]">close</span>
                </button>
              </form>

              {suggestionsOpen && normalizedSearch ? (
                <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 overflow-hidden rounded-lg border border-outline-variant/35 bg-[rgb(244_249_255_/_0.96)] shadow-lg backdrop-blur-xl dark:bg-[rgb(22_30_41_/_0.84)] animate-[ui-fade-in_180ms_ease-out]">
                  {suggestions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-on-surface-variant">No matching suggestions. Press Enter to search all results.</p>
                  ) : null}

                  {suggestions.length > 0 ? (
                    <ul className="max-h-72 overflow-y-auto py-1">
                      {suggestions.map((item) => (
                        <li key={item.id}>
                          <Link
                            href={item.href}
                            className="flex items-start gap-2.5 px-3 py-1.5 transition-colors hover:bg-surface-container-high/60"
                            onClick={() => {
                              setSuggestionsOpen(false);
                              setSearchExpanded(false);
                            }}
                          >
                            <span className="material-symbols-outlined mt-0.5 text-base text-primary/80">{item.icon}</span>
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-semibold text-on-surface">{item.label}</span>
                              <span className="block truncate text-[10px] text-on-surface-variant">{item.description}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {searchIndexLoading ? (
                    <p className="border-t border-outline-variant/15 px-3 py-1.5 text-[10px] uppercase tracking-wider text-on-surface-variant">Syncing file suggestions...</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            type="button"
            ref={searchToggleButtonRef}
            className={`h-9 w-9 place-items-center rounded-lg border border-outline-variant/20 bg-surface-container-low text-on-surface-variant transition-colors hover:text-primary ${
              searchExpanded ? "hidden md:grid" : "grid"
            }`}
            onClick={toggleSearch}
            aria-label={searchExpanded ? "Close search" : "Open search"}
            aria-expanded={searchExpanded}
          >
            <span className="material-symbols-outlined text-base">{searchExpanded ? "close" : "search"}</span>
          </button>

          <Link
            href="/notifications"
            className={`relative grid h-9 w-9 place-items-center rounded-lg border border-outline-variant/20 bg-surface-container-low transition-colors ${
              notificationsActive ? "text-primary" : "text-on-surface-variant hover:text-primary"
            }`}
            aria-label="notifications"
          >
            <span className="material-symbols-outlined">notifications</span>
            {hasUnreadNotifications ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full border border-background bg-primary"></span> : null}
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

      <main className={`min-h-screen px-3 pb-8 md:px-6 ${desktopNavCollapsed ? "md:ml-[4.5rem]" : "md:ml-64"} ${guestBannerVisible ? "pt-[6.5rem]" : "pt-[4.5rem]"}`}>
        <div className="mx-auto w-full max-w-[1240px]">{children}</div>
      </main>
    </div>
  );
}