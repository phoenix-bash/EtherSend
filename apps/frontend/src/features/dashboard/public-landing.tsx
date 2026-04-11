"use client";

import Link from "next/link";
import { useThemeMode } from "../../hooks/use-theme";

interface PublicLandingProps {
  onContinueAsGuest?: () => void;
}

export function PublicLanding({ onContinueAsGuest }: PublicLandingProps) {
  const { theme, toggleTheme } = useThemeMode();

  function handleContinueAsGuest(): void {
    if (onContinueAsGuest) {
      onContinueAsGuest();
      return;
    }

    window.localStorage.setItem("lf_guest_mode_enabled", "true");
    window.location.href = "/";
  }

  return (
    <div className="relative min-h-screen bg-background text-on-surface">
      <div className="pointer-events-none absolute inset-0 mesh-gradient opacity-90" aria-hidden="true"></div>

      <div className="relative z-10">
        <header className="sticky top-0 z-30 border-b border-outline-variant/20 bg-surface-container-low/80 backdrop-blur-2xl">
          <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between px-5 py-4 md:px-8">
            <Link href="/" className="font-headline text-xl font-extrabold uppercase tracking-tight text-on-surface">
              LinkForge
            </Link>

            <nav className="hidden items-center gap-6 md:flex">
              <a href="#platform" className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant transition-colors hover:text-on-surface">
                Infrastructure
              </a>
              <a href="#docs" className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant transition-colors hover:text-on-surface">
                API Docs
              </a>
            </nav>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant/30 bg-surface-container px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface transition-all hover:border-primary/35 hover:text-primary"
                onClick={toggleTheme}
                aria-label="Toggle color theme"
              >
                <span className="material-symbols-outlined text-sm">{theme === "dark" ? "light_mode" : "dark_mode"}</span>
                {theme === "dark" ? "Light" : "Dark"}
              </button>

              <Link
                href="/auth/signin"
                className="rounded-md border border-outline-variant/30 bg-surface-container px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface transition-all hover:border-primary/35 hover:text-primary"
              >
                Sign In
              </Link>
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[1320px] flex-col gap-12 px-5 pb-16 pt-10 md:gap-16 md:px-8 md:pt-14">
          <section className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-6 md:p-8">
            <div className="grid gap-8 xl:grid-cols-[1.3fr_1fr] xl:items-center">
              <div>
                <h1 className="bg-gradient-to-br from-on-surface via-on-surface to-on-surface-variant bg-clip-text font-headline text-4xl font-extrabold leading-tight tracking-tighter text-transparent md:text-6xl">
                  LinkForge: Media Hosting with Surgical Control
                </h1>
                <p className="mt-4 max-w-2xl text-base text-on-surface-variant md:text-lg">
                  Direct links. Batch shares. Expiry policies. Guest-friendly. Secure your assets with architectural precision.
                </p>

                <div className="mt-6 w-full max-w-2xl overflow-hidden rounded-lg border border-outline-variant/30 bg-surface-container-lowest terminal-glow">
                  <div className="flex items-center gap-2 border-b border-outline-variant/20 bg-surface-container-low px-4 py-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-error-dim"></span>
                    <span className="h-2.5 w-2.5 rounded-full bg-tertiary"></span>
                    <span className="h-2.5 w-2.5 rounded-full bg-primary"></span>
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-widest text-on-surface-variant">forge-cli - bash</span>
                  </div>
                  <div className="p-6 font-mono text-sm">
                    <div className="flex gap-3">
                      <span className="text-primary/50">$</span>
                      <span className="text-on-surface">linkforge media upload --secure --expiry 7d</span>
                    </div>
                    <div className="mt-2 flex gap-3 text-on-surface-variant">
                      <span className="opacity-0">$</span>
                      <span>
                        [ <span className="text-primary">##########</span>---------- ] 50% uploading...
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link href="/auth/signin" className="rounded-lg bg-gradient-to-r from-primary to-primary-container px-6 py-3 text-xs font-label font-bold uppercase tracking-widest text-on-primary-container transition-all hover:brightness-110">
                    Continue with OAuth
                  </Link>
                  <button
                    type="button"
                    onClick={handleContinueAsGuest}
                    className="rounded-lg border border-outline-variant/30 bg-transparent px-6 py-3 text-xs font-label font-bold uppercase tracking-widest text-on-surface-variant transition-all hover:bg-surface-container-high hover:text-on-surface"
                  >
                    Continue as Guest
                  </button>
                </div>
              </div>

              <div className="grid gap-3">
                <article className="rounded-lg border border-outline-variant/15 bg-surface-container p-4 transition-all hover:border-primary/30">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5 text-primary">
                    <span className="material-symbols-outlined text-2xl">link</span>
                  </div>
                  <h2 className="font-headline text-2xl font-bold text-on-surface">Direct Image Links</h2>
                  <p className="mt-2 text-sm text-on-surface-variant">Raw URL access for embedding anywhere with no interstitial pages.</p>
                </article>

                <article className="rounded-lg border border-outline-variant/15 bg-surface-container p-4 transition-all hover:border-primary/30">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5 text-primary">
                    <span className="material-symbols-outlined text-2xl">folder_zip</span>
                  </div>
                  <h2 className="font-headline text-2xl font-bold text-on-surface">Batch Sharing</h2>
                  <p className="mt-2 text-sm text-on-surface-variant">Share one secure link for a complete asset set with policy controls.</p>
                </article>

                <article className="rounded-lg border border-outline-variant/15 bg-surface-container p-4 transition-all hover:border-primary/30">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/5 text-primary">
                    <span className="material-symbols-outlined text-2xl">timer</span>
                  </div>
                  <h2 className="font-headline text-2xl font-bold text-on-surface">Expiry Controls</h2>
                  <p className="mt-2 text-sm text-on-surface-variant">Self-destruct timers and one-time policies for controlled distribution.</p>
                </article>
              </div>
            </div>
          </section>

          <section id="platform" className="grid gap-4 md:grid-cols-3">
            <article className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-6">
              <p className="text-[10px] font-label uppercase tracking-[0.2em] text-primary">Global Delivery</p>
              <h3 className="mt-3 font-headline text-2xl font-bold text-on-surface">Low-latency media at scale.</h3>
              <p className="mt-3 text-sm text-on-surface-variant">Distribute assets with stable URLs and high-speed access built for campaigns, docs, and production apps.</p>
            </article>

            <article className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-6">
              <p className="text-[10px] font-label uppercase tracking-[0.2em] text-primary">Controlled Access</p>
              <h3 className="mt-3 font-headline text-2xl font-bold text-on-surface">Policies that fit your workflow.</h3>
              <p className="mt-3 text-sm text-on-surface-variant">Set file-level controls, batch-level policies, and clear expiration rules with minimal operational overhead.</p>
            </article>

            <article id="docs" className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-6">
              <p className="text-[10px] font-label uppercase tracking-[0.2em] text-primary">Developer First</p>
              <h3 className="mt-3 font-headline text-2xl font-bold text-on-surface">CLI and API ready.</h3>
              <p className="mt-3 text-sm text-on-surface-variant">Integrate LinkForge into internal tools, pipelines, and customer-facing products without changing your architecture.</p>
            </article>
          </section>
        </main>

        <footer className="border-t border-outline-variant/20 bg-surface-container-low/65">
          <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-4 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <p className="font-headline text-lg font-bold uppercase tracking-tight text-on-surface">LinkForge</p>
              <p className="mt-1 text-xs text-on-surface-variant">Asset intelligence platform for modern media operations.</p>
            </div>

            <div className="flex items-center gap-4">
              <a href="#platform" className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant transition-colors hover:text-on-surface">
                Product
              </a>
              <a href="#docs" className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant transition-colors hover:text-on-surface">
                Docs
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}