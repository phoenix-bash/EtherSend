import { Suspense } from "react";
import { AuthCallbackClient } from "./callback-client";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="mesh-gradient relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
          <section className="glass-card w-full max-w-[440px] rounded-lg border border-outline-variant/20 p-10 shadow-[0px_0px_36px_rgba(75,188,214,0.06)]">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">Authentication Gateway</p>
            <h1 className="mt-2 font-headline text-3xl font-extrabold tracking-tight text-on-surface">Finalizing Sign-In</h1>
            <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
              <span className="material-symbols-outlined text-sm">progress_activity</span>
              Processing OAuth callback...
            </p>
          </section>
        </main>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}
