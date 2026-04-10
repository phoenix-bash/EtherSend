"use client";

import { API_BASE_URL } from "../../../lib/api-client";

function oauthStartUrl(provider: "google" | "github"): string {
  const query = new URLSearchParams({
    mode: "token",
    redirectPath: "/auth/callback"
  });

  return `${API_BASE_URL}/auth/${provider}/start?${query.toString()}`;
}

export default function SignInPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-10">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-lift">
        <h1 className="text-2xl font-semibold">Sign in to LinkForge</h1>
        <p className="text-sm opacity-80">Email/password is disabled. Continue with Google or GitHub OAuth.</p>

        <button
          type="button"
          onClick={() => {
            window.location.href = oauthStartUrl("google");
          }}
          className="rounded-xl border border-border bg-bg px-4 py-3 text-left text-sm hover:opacity-90"
        >
          Continue with Google
        </button>

        <button
          type="button"
          onClick={() => {
            window.location.href = oauthStartUrl("github");
          }}
          className="rounded-xl border border-border bg-bg px-4 py-3 text-left text-sm hover:opacity-90"
        >
          Continue with GitHub
        </button>
      </div>
    </main>
  );
}
