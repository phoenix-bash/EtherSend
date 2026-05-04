"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LandingAmbientScene } from "./landing-ambient-scene";
import { LandingFlowScene } from "./landing-flow-scene";
import { LandingIntroSequence } from "./landing-intro-sequence";
import { LandingTypedHeadline } from "./landing-typed-headline";
import { useThemeMode } from "../../hooks/use-theme";

const GUEST_MODE_STORAGE_KEY = "lf_guest_mode_enabled";
const GUEST_MODE_EXPIRES_AT_KEY = "lf_guest_mode_expires_at";
const GUEST_SESSION_TTL_MS = 15 * 60 * 1000;

interface PublicLandingProps {
  onContinueAsGuest?: () => void;
}

export function PublicLanding({ onContinueAsGuest }: PublicLandingProps) {
  const { theme, toggleTheme } = useThemeMode();
  const currentYear = new Date().getFullYear();
  const [introComplete, setIntroComplete] = useState(false);
  const marqueeItems = ["Upload", "Share", "Control", "Expire", "Delete", "Vanish"];

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mediaQuery.matches) {
      setIntroComplete(true);
    }
  }, []);

  const handleIntroComplete = useCallback(() => {
    setIntroComplete(true);
  }, []);

  useEffect(() => {
    if (!introComplete) {
      return;
    }

    const revealNodes = Array.from(document.querySelectorAll<HTMLElement>(".landing-reveal"));
    if (revealNodes.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          const target = entry.target as HTMLElement;
          const revealIndex = Number(target.dataset.revealIndex ?? "0");

          window.setTimeout(() => {
            target.classList.add("is-visible");
          }, revealIndex * 80);

          observer.unobserve(target);
        });
      },
      { threshold: 0.1 }
    );

    revealNodes.forEach((node, index) => {
      node.dataset.revealIndex = String(index);
      observer.observe(node);
    });

    return () => {
      observer.disconnect();
    };
  }, [introComplete]);

  function handleContinueAsGuest(): void {
    if (onContinueAsGuest) {
      onContinueAsGuest();
      return;
    }

    window.localStorage.setItem(GUEST_MODE_STORAGE_KEY, "true");
    window.localStorage.setItem(GUEST_MODE_EXPIRES_AT_KEY, String(Date.now() + GUEST_SESSION_TTL_MS));
    window.location.href = "/";
  }

  return (
    <div className="landing-bg-base glass-site relative min-h-screen overflow-hidden bg-background text-on-surface">
      <div className="pointer-events-none absolute inset-0 landing-bg-overlay" aria-hidden="true"></div>
      <LandingAmbientScene theme={theme} />
      {!introComplete ? <LandingIntroSequence onComplete={handleIntroComplete} /> : null}

      <div className={`relative z-10 flex min-h-screen flex-col ${introComplete ? "landing-shell-ready" : "landing-shell-hidden"}`}>
        <header className="landing-topbar sticky top-0 z-30 border-b border-outline-variant/20 bg-surface-container-low/80 backdrop-blur-2xl landing-entry-0">
          <div className="flex w-full items-center justify-between px-5 py-4 md:px-8">
            <Link href="/" className="landing-brand-lockup">
              <img src="/Media_Assets/EtherSend.png" alt="EtherSend logo" className="landing-brand-logo" />
              <span className="landing-brand-name">EtherSend</span>
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

        <main className="flex w-full flex-1 flex-col gap-0 pb-10 pt-8 md:pb-12 md:pt-16">
          <motion.section
            initial={{ opacity: 0, y: 26 }}
            animate={introComplete ? { opacity: 1, y: 0 } : { opacity: 0, y: 26 }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="landing-hero-section relative overflow-visible"
          >
            <div className="grid gap-10 xl:grid-cols-[1.04fr_1fr] xl:items-center xl:gap-14">
              <div className="landing-hero-copy relative z-20">
                <p className="landing-hero-eyebrow text-[10px] font-label uppercase tracking-[0.24em] text-primary">Ephemeral File Delivery Protocol</p>
                <LandingTypedHeadline
                  start={introComplete}
                  className="mt-3 font-headline text-[1.32rem] font-semibold leading-[1.04] tracking-tight text-on-surface sm:text-[2.25rem] md:text-[3.15rem] lg:text-[3.6rem]"
                />
                <p className="landing-hero-subcopy subtitle-text mt-3 max-w-2xl text-base text-on-surface-variant md:text-lg">
                  Transfer files fast with sender-first control — set expiry, revoke access, and keep distribution intentionally temporary.
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/25 bg-surface-container-low/65 px-3 py-1 text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm text-primary">link</span>
                    Time-bound links
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/25 bg-surface-container-low/65 px-3 py-1 text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm text-primary">admin_panel_settings</span>
                    Sender-owned control
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/25 bg-surface-container-low/65 px-3 py-1 text-xs text-on-surface-variant">
                    <span className="material-symbols-outlined text-sm text-primary">auto_delete</span>
                    Auto-expiry defaults
                  </div>
                </div>

                <div className="mt-6 grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:gap-3">
                  <Link
                    href="/auth/signin"
                    className="inline-flex h-11 w-full min-w-0 items-center justify-center whitespace-normal rounded-lg bg-gradient-to-r from-primary via-primary-container to-primary px-2 text-center text-[11px] font-label font-semibold leading-tight text-on-primary shadow-[0_12px_28px_rgb(0_0_0_/_0.22)] transition-all hover:brightness-110 sm:w-auto sm:whitespace-nowrap sm:px-6 sm:text-xs sm:leading-none"
                  >
                    Start Controlled Sharing
                  </Link>
                  <button
                    type="button"
                    onClick={handleContinueAsGuest}
                    className="inline-flex h-11 w-full min-w-0 items-center justify-center whitespace-normal rounded-lg border border-outline-variant/30 bg-surface-container-low/25 px-2 text-center text-[11px] font-label font-semibold leading-tight text-on-surface-variant transition-all hover:bg-surface-container-high/45 hover:text-on-surface sm:w-auto sm:whitespace-nowrap sm:px-6 sm:text-xs sm:leading-none"
                  >
                    Continue in Guest Mode
                  </button>
                </div>
              </div>

              <div className="landing-hero-visual relative z-0 w-full xl:justify-self-stretch">
                <LandingFlowScene theme={theme} />
              </div>
            </div>
          </motion.section>

          <section className="landing-marquee-wrap" aria-hidden="true">
            <div className="landing-marquee-track">
              {Array.from({ length: 4 }).map((_, groupIndex) =>
                marqueeItems.map((item) => (
                  <span key={`${item}-${groupIndex}`} className="landing-marquee-item">
                    {item} <span className="landing-marquee-separator">→</span>
                  </span>
                ))
              )}
            </div>
          </section>

          <section id="features" className="landing-reveal">
            <div className="landing-section-badge">
              <span className="dot" />
              Live Now — Current Build
            </div>
            <div className="landing-section-header mb-8">
              <h2 className="landing-section-title mt-3">
                What It <span className="accent">Does</span>
                <br />
                Right Now
              </h2>
            </div>
            <div className="landing-features-grid">
              {[
                {
                  icon: "bolt",
                  title: "Instant Sharing",
                  text: "Upload a file → get a link. Zero friction. No waiting and no setup overhead.",
                  tone: ""
                },
                {
                  icon: "timer",
                  title: "Set Expiry",
                  text: "Your files do not live forever unless you decide they should.",
                  tone: "red-accent"
                },
                {
                  icon: "tune",
                  title: "Post-Share Control",
                  text: "Already shared the link? You still control access and behavior.",
                  tone: "cyan-accent"
                },
                {
                  icon: "link",
                  title: "Clean Direct Links",
                  text: "No clutter pages. Click → open → done.",
                  tone: "cyan-accent"
                },
                {
                  icon: "verified_user",
                  title: "With or Without Account",
                  text: "Login for bigger limits or use guest mode for fast one-off sharing.",
                  tone: ""
                },
                {
                  icon: "auto_awesome",
                  title: "Clean, Smooth UI",
                  text: "Upload and go. Controls stay predictable and clear.",
                  tone: "red-accent"
                },
              ].map((item) => (
                <article key={item.title} className={`landing-feature-card ${item.tone}`}>
                  <span className="landing-feature-icon material-symbols-outlined">{item.icon}</span>
                  <h3 className="landing-feature-title">{item.title}</h3>
                  <p className="landing-feature-desc">{item.text}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="landing-statement-section landing-reveal">
            <p className="landing-statement-text">
              The Internet <span className="red">Saves</span> Everything.
              <br />
              EtherSend <span className="green">Doesn&apos;t.</span>
            </p>
            <p className="landing-statement-sub">
              You don&apos;t need another cloud storage.
              <br />
              You need control.
            </p>
          </section>

          <section id="coming" className="landing-reveal">
            <div className="landing-section-header mb-8">
              <p className="landing-section-label">Roadmap</p>
              <h2 className="landing-section-title mt-3">
                Next <span className="accent">Level</span>
                <br />
                Is Coming
              </h2>
            </div>
            <div className="landing-coming-grid">
              {[
                { number: "01", title: "Private by Design", desc: "Files encrypted before leaving your device." },
                { number: "02", title: "Anonymous Sharing", desc: "No identity needed for clean outbound sharing." },
                { number: "03", title: "Self-Destruct Links", desc: "Open once or time-based links that vanish." },
                { number: "04", title: "Hidden Sharing", desc: "Optional password and stealth-style access." },
                { number: "05", title: "Anonymous Receive", desc: "Accept files through receive links with no account." },
                { number: "06", title: "Direct Device Sharing", desc: "Peer-to-peer style transfer paths." },
              ].map((item) => (
                <article key={item.title} className="landing-coming-card">
                  <p className="landing-coming-num">{item.number}</p>
                  <h3 className="landing-coming-title">{item.title}</h3>
                  <p className="landing-coming-desc">{item.desc}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="why" className="landing-reveal">
            <div className="landing-why-section">
              <div>
                <p className="landing-section-label">The Philosophy</p>
                <h2 className="landing-why-quote mt-3">
                  Not Everything Should
                  <br />
                  <span className="strike">Stay Forever.</span>
                </h2>
                <div className="landing-why-body mt-4">
                  <p>Some things are meant to disappear.</p>
                  <p>EtherSend exists because internet defaults to permanence. Every file saved, every share logged, every link alive forever.</p>
                  <p>You shared it. You decide when it&apos;s gone.</p>
                </div>
              </div>
              <div className="landing-truth-list">
                {[
                  "Files shouldn’t stay forever unless you want them to.",
                  "Auto-save convenience should not remove sender control.",
                  "Easy recovery should not mean permanent exposure.",
                  "Send. Set expiry. Revoke. Disappear. Always your call.",
                ].map((truth) => (
                  <div key={truth} className="landing-truth-item">
                    <p className="landing-truth-text">{truth}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="landing-cta-section landing-reveal text-center">
            <h2 className="landing-cta-title">
              Ready To <span className="accent">Send</span>
              <br />
              & Disappear?
            </h2>
            <p className="landing-cta-sub mt-4">No setup. No commitment. Upload a file. Get a link. Be in control.</p>
            <div className="landing-cta-actions mt-8">
              <Link
                href="/auth/signin"
                className="landing-btn-primary inline-flex h-11 items-center justify-center whitespace-nowrap rounded-lg px-6 text-xs font-semibold uppercase tracking-wider"
              >
                Launch EtherSend →
              </Link>
              <button
                type="button"
                onClick={handleContinueAsGuest}
                className="landing-btn-secondary inline-flex h-11 items-center justify-center whitespace-nowrap rounded-lg px-6 text-xs font-semibold uppercase tracking-wider"
              >
                Guest Mode — No Login
              </button>
            </div>
          </section>
        </main>

        <footer className="landing-footer mt-auto border-t border-outline-variant/20 landing-entry-3">
          <div className="flex w-full flex-col gap-4 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-8">
            <Link href="/" className="landing-brand-lockup landing-footer-brand-lockup">
              <img src="/Media_Assets/EtherSend.png" alt="EtherSend logo" className="landing-brand-logo landing-footer-logo" />
              <span className="landing-footer-brand">EtherSend</span>
            </Link>
            <div className="flex flex-col items-start gap-2 md:items-end">
              <p className="landing-footer-copy">SEND IT. CONTROL IT. MAKE IT DISAPPEAR. © {currentYear}</p>
              <Link href="/legal/disclaimer" className="text-[11px] uppercase tracking-wider text-on-surface-variant hover:text-primary">
                Legal Disclaimer & Acceptable Use
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}