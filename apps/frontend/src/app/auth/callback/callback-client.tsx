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
    <main className="min-h-screen px-4 py-8 md:px-10">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-lift">
        <h1 className="text-2xl font-semibold">Authentication</h1>
        <p className="text-sm">{message}</p>

        {status === "loading" && <p className="text-sm opacity-80">Please wait...</p>}
        {status === "success" && <p className="text-sm text-accent">Signed in. Redirecting...</p>}
        {status === "error" && (
          <Link href="/auth/signin" className="w-fit rounded-xl border border-border bg-bg px-3 py-2 text-sm">
            Back to sign in
          </Link>
        )}
      </div>
    </main>
  );
}
