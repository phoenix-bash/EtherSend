"use client";

import { Github } from "lucide-react";
import { API_BASE_URL } from "../../../lib/api-client";

const GUEST_MODE_STORAGE_KEY = "lf_guest_mode_enabled";

function oauthStartUrl(provider: "google" | "github"): string {
  const query = new URLSearchParams({
    mode: "token",
    redirectPath: "/auth/callback"
  });

  return `${API_BASE_URL}/auth/${provider}/start?${query.toString()}`;
}

export default function SignInPage() {
  function handleContinueAsGuest(): void {
    window.localStorage.setItem(GUEST_MODE_STORAGE_KEY, "true");
    window.location.href = "/";
  }

  return (
    <main className="mesh-gradient relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <div className="grain-overlay pointer-events-none fixed inset-0 z-0"></div>
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/5 blur-[120px]"></div>
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-secondary/5 blur-[120px]"></div>

      <section className="glass-card relative z-10 w-full max-w-[400px] rounded-lg border border-outline-variant/20 p-10 shadow-[0px_0px_36px_rgba(75,188,214,0.06)]">
        <div className="mb-10 text-center">
          <div className="group mb-6 inline-flex h-14 w-14 items-center justify-center rounded-lg bg-surface-container-high shadow-[0px_0px_16px_rgba(75,188,214,0.12)] transition-all duration-300 hover:shadow-[0px_0px_22px_rgba(75,188,214,0.18)]">
            <span className="material-symbols-outlined text-3xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              link
            </span>
          </div>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">LinkForge</h1>
          <p className="mt-2 text-[11px] font-label uppercase tracking-widest text-on-surface-variant">Asset Intelligence Portal</p>
        </div>

        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              window.location.href = oauthStartUrl("google");
            }}
            className="group flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-outline-variant/20 bg-surface-container-high transition-all duration-200 active:scale-[0.98] hover:bg-surface-bright"
          >
            <img
              alt="Google"
              className="h-5 w-5 grayscale transition-all group-hover:grayscale-0"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBmZdCKQv8WmnwG5gjh64MR8HS9rGgHftnUppXYamL1hz0daf1Jwl-qIIkqeVKliVxje1dFbljE8D3pFeYrm9_1g0gbPJB9trULwqW-RWdWNFglUgJhywttR6p7Kz2d7GyKfpykhHRmSc5vSXriRuoi-kRM28PV38Jf9y0pTND6hR9nxbZ-ArMu6aYcxdddDhliNs2s_YgzR6c2yeJtGS3QP01rJc9Yr5yfW42x32Fy1RBezFzZnAv5EBNj-FvnfGNID-Wj3o1xJw"
            />
            <span className="text-xs font-label uppercase tracking-wider text-on-surface">Sign in with Google</span>
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = oauthStartUrl("github");
            }}
            className="group flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-outline-variant/20 bg-surface-container-high transition-all duration-200 active:scale-[0.98] hover:bg-surface-bright"
          >
            <Github className="h-4 w-4" />
            <span className="text-xs font-label uppercase tracking-wider text-on-surface">Sign in with GitHub</span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleContinueAsGuest}
          className="mt-6 flex w-fit items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container px-3 py-2 text-xs font-label uppercase tracking-wider text-on-surface transition-colors hover:text-primary mx-auto"
        >
          Continue as guest
        </button>

        <div className="mt-8 flex items-center justify-between px-1 text-[10px] uppercase tracking-widest text-on-surface-variant/60">
          <p>v2.4.0-stable</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-primary">Privacy</a>
            <a href="#" className="hover:text-primary">Security</a>
          </div>
        </div>
      </section>

      <div className="fixed left-0 top-0 z-20 h-1 w-full bg-gradient-to-r from-primary/0 via-primary/25 to-primary/0"></div>
      <div className="fixed bottom-0 left-0 z-20 h-1 w-full bg-gradient-to-r from-secondary/0 via-secondary/15 to-secondary/0"></div>
    </main>
  );
}
