"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { ApiError, requestPasswordReset } from "../../../lib/api-client";

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const prefilledEmail = searchParams.get("email");
    if (prefilledEmail) {
      setEmail(prefilledEmail);
    }
  }, [searchParams]);

  const reason = searchParams.get("reason");

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("");
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Email is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      await requestPasswordReset(normalizedEmail);
      setStatus("If an account exists, a reset link has been sent to your email.");
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError("Unable to send reset email right now.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="glass-site mesh-gradient relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <section className="glass-card relative z-10 w-full max-w-[430px] rounded-lg border border-outline-variant/20 p-8">
        <p className="text-[11px] font-label uppercase tracking-widest text-on-surface-variant">Password recovery</p>
        <h1 className="mt-2 font-headline text-3xl font-extrabold tracking-tight text-on-surface">Forgot Password</h1>
        <p className="mt-3 text-sm text-on-surface-variant">Enter your email and we will send you a password reset link.</p>
        {reason === "session-limit" ? (
          <p className="mt-2 text-xs text-error">You reached the session limit. Reset your password to continue and sign out all other devices.</p>
        ) : null}

        <form className="mt-6 space-y-3" onSubmit={(event) => {
          void onSubmit(event);
        }}>
          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            placeholder="Email"
            autoComplete="email"
            required
            className="h-11 w-full rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0"
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="h-11 w-full rounded-lg border border-primary/30 bg-primary/15 text-xs font-label uppercase tracking-widest text-primary transition-colors hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Sending..." : "Send reset link"}
          </button>
        </form>

        {status ? <p className="mt-4 text-xs text-primary">{status}</p> : null}
        {error ? <p className="mt-2 text-xs text-error">{error}</p> : null}

        <div className="mt-6">
          <Link
            href="/auth/signin"
            className="inline-flex rounded-lg border border-outline-variant/20 bg-surface-container px-3 py-2 text-xs font-label uppercase tracking-wider text-on-surface hover:text-primary"
          >
            Back to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
