"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LandingAmbientScene } from "./landing-ambient-scene";
import { LandingFlowScene } from "./landing-flow-scene";
import { LandingIntroSequence } from "./landing-intro-sequence";
import { LandingTypedHeadline } from "./landing-typed-headline";
import { useThemeMode } from "../../hooks/use-theme";

interface PublicLandingProps {
  onContinueAsGuest?: () => void;
}

export function PublicLanding({ onContinueAsGuest }: PublicLandingProps) {
  const { theme, toggleTheme } = useThemeMode();
  const currentYear = new Date().getFullYear();
  const [introComplete, setIntroComplete] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      setIntroComplete(true);
    }
  }, []);

  const handleIntroComplete = useCallback(() => {
    setIntroComplete(true);
  }, []);

  function handleContinueAsGuest(): void {
    if (onContinueAsGuest) {
      onContinueAsGuest();
      return;
    }

    window.localStorage.setItem("lf_guest_mode_enabled", "true");
    window.location.href = "/";
  }

  return (
    <div className="glass-site relative min-h-screen overflow-hidden bg-background text-on-surface">
      <div className="pointer-events-none absolute inset-0 mesh-gradient opacity-90" aria-hidden="true"></div>
      <LandingAmbientScene theme={theme} />
      {!introComplete ? <LandingIntroSequence onComplete={handleIntroComplete} /> : null}

      <div className={`relative z-10 flex min-h-screen flex-col ${introComplete ? "landing-shell-ready" : "landing-shell-hidden"}`}>
        <header className="landing-topbar sticky top-0 z-30 border-b border-outline-variant/20 bg-surface-container-low/80 backdrop-blur-2xl landing-entry-0">
          <div className="mx-auto flex w-full max-w-[1320px] items-center justify-between px-5 py-4 md:px-8">
            <Link href="/" className="font-headline text-xl font-extrabold tracking-tight text-on-surface">
              EtherSend
            </Link>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant/30 bg-surface-container px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface transition-all hover:border-primary/35 hover:text-primary"
                onClick={toggleTheme}
                aria-label="Toggle color theme"
              >
                <span className="material-symbols-outlined text-sm">{theme === "dark" ? "dark_mode" : "light_mode"}</span>
                Theme: {theme === "dark" ? "Dark" : "Light"}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[1320px] flex-1 flex-col gap-10 px-5 pb-12 pt-12 md:gap-14 md:px-8 md:pt-16">
          <motion.section
            initial={{ opacity: 0, y: 26, filter: "blur(8px)" }}
            animate={introComplete ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 26, filter: "blur(8px)" }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="landing-main-card relative overflow-hidden rounded-[2.2rem] border border-outline-variant/20 p-6 md:p-8 xl:p-10"
          >
            <div className="grid gap-8 xl:grid-cols-[1.02fr_1.14fr] xl:items-center">
              <div>
                <p className="text-[10px] font-label uppercase tracking-[0.24em] text-primary">Link Sharing For Real Teams</p>
                <LandingTypedHeadline
                  start={introComplete}
                  className="mt-3 bg-gradient-to-br from-on-surface via-on-surface to-on-surface-variant bg-clip-text font-headline text-[1.65rem] font-semibold leading-[1.04] tracking-tight text-transparent sm:text-4xl md:text-6xl"
                />
                <p className="subtitle-text mt-3 max-w-2xl text-base text-on-surface-variant md:text-lg">
                  Share files, media, and updates fast while keeping links reliable, private, and easy to control.
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/25 bg-surface-container-low/65 px-3 py-1 text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm text-primary">link</span>
                    Clear, stable links
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/25 bg-surface-container-low/65 px-3 py-1 text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm text-primary">shield</span>
                    Simple access controls
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/25 bg-surface-container-low/65 px-3 py-1 text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm text-primary">timer</span>
                    Easy expiry rules
                  </div>
                </div>

                <div className="mt-7 flex w-full flex-nowrap gap-2 sm:w-auto sm:gap-3">
                  <Link
                    href="/auth/signin"
                    className="inline-flex h-11 w-1/2 items-center justify-center whitespace-nowrap rounded-lg bg-gradient-to-r from-primary via-primary-container to-primary px-3 text-center text-[11px] font-label font-semibold leading-none text-on-primary shadow-[0_12px_28px_rgb(0_0_0_/_0.22)] transition-all hover:brightness-110 sm:w-auto sm:px-6 sm:text-xs"
                  >
                    Start Sharing
                  </Link>
                  <button
                    type="button"
                    onClick={handleContinueAsGuest}
                    className="inline-flex h-11 w-1/2 items-center justify-center whitespace-nowrap rounded-lg border border-outline-variant/30 bg-surface-container-low/25 px-3 text-center text-[11px] font-label font-semibold leading-none text-on-surface-variant transition-all hover:bg-surface-container-high/45 hover:text-on-surface sm:w-auto sm:px-6 sm:text-xs"
                  >
                    Continue as Guest
                  </button>
                </div>
              </div>

              <div className="w-full xl:justify-self-stretch">
                <LandingFlowScene theme={theme} />
              </div>
            </div>
          </motion.section>

          <motion.section
            id="how-it-works"
            initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
            animate={introComplete ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 24, filter: "blur(6px)" }}
            transition={{ duration: 0.68, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="landing-main-card relative overflow-hidden rounded-[2rem] border border-outline-variant/20 p-6 md:p-8"
          >
            <div className="pointer-events-none absolute inset-x-10 top-[5.1rem] hidden h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent md:block" aria-hidden="true"></div>
            <h2 className="font-headline text-3xl font-bold tracking-tight text-on-surface md:text-4xl">How it works</h2>
            <p className="subtitle-text mt-2 max-w-2xl text-sm text-on-surface-variant md:text-base">Three simple steps to upload, share, and control access without extra overhead.</p>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <motion.article
                initial={{ opacity: 0, y: 20, filter: "blur(5px)" }}
                animate={introComplete ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 20, filter: "blur(5px)" }}
                transition={{ duration: 0.55, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="landing-flow-subcard rounded-[1.3rem] border border-outline-variant/20 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">1</div>
                  <h3 className="font-headline text-xl font-bold text-on-surface">Upload files</h3>
                </div>
                <p className="subtitle-text mt-2 text-sm text-on-surface-variant">Drop one file or a full batch and keep everything organized in one place.</p>
              </motion.article>

              <motion.article
                initial={{ opacity: 0, y: 20, filter: "blur(5px)" }}
                animate={introComplete ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 20, filter: "blur(5px)" }}
                transition={{ duration: 0.55, delay: 0.39, ease: [0.22, 1, 0.36, 1] }}
                className="landing-flow-subcard rounded-[1.3rem] border border-outline-variant/20 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">2</div>
                  <h3 className="font-headline text-xl font-bold text-on-surface">Copy a stable link</h3>
                </div>
                <p className="subtitle-text mt-2 text-sm text-on-surface-variant">Share direct links or QR-ready batch links that work across channels.</p>
              </motion.article>

              <motion.article
                initial={{ opacity: 0, y: 20, filter: "blur(5px)" }}
                animate={introComplete ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 20, filter: "blur(5px)" }}
                transition={{ duration: 0.55, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="landing-flow-subcard rounded-[1.3rem] border border-outline-variant/20 p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary">3</div>
                  <h3 className="font-headline text-xl font-bold text-on-surface">Control access</h3>
                </div>
                <p className="subtitle-text mt-2 text-sm text-on-surface-variant">Set download permissions and expiry windows anytime without breaking links.</p>
              </motion.article>
            </div>
          </motion.section>

          <motion.section
            id="for-everyone"
            initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
            animate={introComplete ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 24, filter: "blur(6px)" }}
            transition={{ duration: 0.68, delay: 0.29, ease: [0.22, 1, 0.36, 1] }}
            className="landing-main-card rounded-[2rem] border border-outline-variant/20 p-6 md:p-8"
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] font-label uppercase tracking-[0.2em] text-primary">For Everyone</p>
                <h2 className="mt-2 font-headline text-3xl font-bold tracking-tight text-on-surface md:text-4xl">Built for anyone who shares files.</h2>
                <p className="subtitle-text mt-2 max-w-2xl text-sm text-on-surface-variant md:text-base">Keep delivery fast and dependable with links that stay accessible and controlled.</p>
              </div>
            </div>
          </motion.section>
        </main>

        <footer className="mt-auto border-t border-outline-variant/20 bg-surface-container-low/65 landing-entry-3">
          <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-4 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-8">
            <div>
              <Link href="/" className="font-headline text-lg font-bold tracking-tight text-on-surface">
                EtherSend
              </Link>
              <p className="subtitle-text mt-1 text-xs text-on-surface-variant">Upload files, share links, and set expiry in minutes.</p>
            </div>

            <p className="text-xs text-on-surface-variant">© {currentYear} EtherSend</p>
          </div>
        </footer>
      </div>
    </div>
  );
}