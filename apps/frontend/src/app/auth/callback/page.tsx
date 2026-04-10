import { Suspense } from "react";
import { AuthCallbackClient } from "./callback-client";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen px-4 py-8 md:px-10">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-lift">
            <h1 className="text-2xl font-semibold">Authentication</h1>
            <p className="text-sm opacity-80">Finalizing sign-in...</p>
          </div>
        </main>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}
