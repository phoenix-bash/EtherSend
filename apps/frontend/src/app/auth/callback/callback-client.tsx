"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchCurrentUser, setAccessToken } from "../../../lib/api-client";

export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Finalizing sign-in...");

  useEffect(() => {
    async function finalizeAuth() {
      try {
        const errorCode = searchParams.get("errorCode");
        if (errorCode === "PASSWORD_RESET_REQUIRED") {
          setStatus("error");
          setMessage("Too many active sessions. Reset your password to continue.");
          return;
        }

        const accessToken = searchParams.get("accessToken");
        if (accessToken) {
          setAccessToken(accessToken);
        }

        const user = await fetchCurrentUser();
        if (!user) {
          setStatus("error");
          setMessage("Could not establish session.");
          return;
        }

        setStatus("success");
        setMessage(`Welcome ${user.name || user.email}`);

        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({ type: "linkforge:auth-success" }, window.location.origin);
          window.close();
          return;
        }

        window.setTimeout(() => {
          router.replace("/");
        }, 700);
      } catch {
        setStatus("error");
        setMessage("OAuth callback failed.");
      }
    }

    void finalizeAuth();
  }, [router, searchParams]);

  return (
    <main className="glass-site mesh-gradient relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/5 blur-[120px]"></div>
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-secondary/5 blur-[120px]"></div>

      <section className="glass-card relative z-10 w-full max-w-[440px] rounded-lg border border-outline-variant/20 p-10 shadow-[0px_0px_36px_rgba(75,188,214,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">Authentication Gateway</p>
        <h1 className="mt-2 font-headline text-3xl font-extrabold tracking-tight text-on-surface">Finalizing Sign-In</h1>
        <p className="mt-3 text-sm text-on-surface-variant">{message}</p>

        <div className="mt-6 rounded-lg border border-outline-variant/20 bg-surface-container p-4">
          {status === "loading" ? (
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <span className="material-symbols-outlined text-sm">progress_activity</span>
              Processing OAuth callback...
            </p>
          ) : null}

          {status === "success" ? (
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              Session established. Redirecting...
            </p>
          ) : null}

          {status === "error" ? (
            <div className="space-y-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-error">
                <span className="material-symbols-outlined text-sm">error</span>
                Authorization failed
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/auth/signin" className="inline-flex w-fit rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface hover:text-primary">
                  Back to sign in
                </Link>
                <Link href="/auth/forgot-password?reason=session-limit" className="inline-flex w-fit rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface hover:text-primary">
                  Reset password
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between text-[10px] uppercase tracking-widest text-on-surface-variant">
          <p>OAuth callback</p>
          <p>{status.toUpperCase()}</p>
        </div>
      </section>

      <div className="fixed left-0 top-0 z-20 h-1 w-full bg-gradient-to-r from-primary/0 via-primary/25 to-primary/0"></div>
      <div className="fixed bottom-0 left-0 z-20 h-1 w-full bg-gradient-to-r from-secondary/0 via-secondary/15 to-secondary/0"></div>
    </main>
  );
}
