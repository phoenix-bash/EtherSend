"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { ApiError, resetPasswordWithToken } from "../../../lib/api-client";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("");
    setError("");

    if (!token) {
      setError("Reset token is missing.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      await resetPasswordWithToken({ token, password });
      setStatus("Password updated. You can now sign in.");
      setPassword("");
      setConfirmPassword("");
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError("Unable to reset password.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="glass-site mesh-gradient relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <section className="glass-card relative z-10 w-full max-w-[430px] rounded-lg border border-outline-variant/20 p-8">
        <p className="text-[11px] font-label uppercase tracking-widest text-on-surface-variant">Password recovery</p>
        <h1 className="mt-2 font-headline text-3xl font-extrabold tracking-tight text-on-surface">Reset Password</h1>
        <p className="mt-3 text-sm text-on-surface-variant">Choose a new password for your EtherSend account.</p>

        <form className="mt-6 space-y-3" onSubmit={(event) => {
          void onSubmit(event);
        }}>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              placeholder="New password"
              autoComplete="new-password"
              required
              className="h-11 w-full rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 pr-11 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0"
            />
            <button
              type="button"
              onClick={() => {
                setShowPassword((previous) => !previous);
              }}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-on-surface-variant transition-colors hover:text-primary"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
              }}
              placeholder="Confirm new password"
              autoComplete="new-password"
              required
              className="h-11 w-full rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 pr-11 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0"
            />
            <button
              type="button"
              onClick={() => {
                setShowConfirmPassword((previous) => !previous);
              }}
              aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
              aria-pressed={showConfirmPassword}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-on-surface-variant transition-colors hover:text-primary"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="h-11 w-full rounded-lg border border-primary/30 bg-primary/15 text-xs font-label uppercase tracking-widest text-primary transition-colors hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Updating..." : "Reset password"}
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
