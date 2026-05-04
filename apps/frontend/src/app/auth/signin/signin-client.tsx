"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Chrome, Eye, EyeOff, Github } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  API_BASE_URL,
  ApiError,
  extractApiErrorCode,
  resolveSecurityTeaseMessage,
  signinWithEmail,
  signupWithEmail
} from "../../../lib/api-client";

const GUEST_MODE_STORAGE_KEY = "lf_guest_mode_enabled";
const GUEST_MODE_EXPIRES_AT_KEY = "lf_guest_mode_expires_at";
const GUEST_SESSION_TTL_MS = 15 * 60 * 1000;
const GUEST_UPLOAD_CHOICE_KEY = "ethersend:guest-upload-choice";
const GUEST_CONTINUE_CHOICE = "continue";

function oauthStartUrl(provider: "google" | "github"): string {
  const query = new URLSearchParams({
    mode: "cookie",
    redirectPath: "/auth/callback"
  });

  return `${API_BASE_URL}/auth/${provider}/start?${query.toString()}`;
}

type AuthMode = "signin" | "signup";

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const source = searchParams.get("source");
  const returnToRaw = searchParams.get("returnTo") ?? "/";
  const returnTo = returnToRaw.startsWith("/") ? returnToRaw : "/";
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    function onMessage(event: MessageEvent): void {
      if (event.origin !== window.location.origin) {
        return;
      }

      const payload = event.data as { type?: string } | null;
      if (payload?.type === "linkforge:auth-success") {
        router.push(returnTo);
      }
    }

    window.addEventListener("message", onMessage);

    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [returnTo, router]);

  function handleContinueAsGuest(): void {
    window.localStorage.setItem(GUEST_MODE_STORAGE_KEY, "true");
    window.localStorage.setItem(GUEST_MODE_EXPIRES_AT_KEY, String(Date.now() + GUEST_SESSION_TTL_MS));
    if (source === "upload") {
      window.localStorage.setItem(GUEST_UPLOAD_CHOICE_KEY, GUEST_CONTINUE_CHOICE);
    }

    router.push(returnTo);
  }

  function startOAuthInSameTab(provider: "google" | "github"): void {
    window.location.href = oauthStartUrl(provider);
  }

  async function onAuthSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setStatus("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Email is required.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "signup") {
        await signupWithEmail({
          email: normalizedEmail,
          password,
          name: name.trim() || undefined
        });
        setStatus("Account created. Check your email for the verification link.");
        setPassword("");
        setConfirmPassword("");
        setMode("signin");
      } else {
        await signinWithEmail({
          email: normalizedEmail,
          password
        });
        router.push(returnTo);
      }
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        const errorCode = extractApiErrorCode(caughtError);
        if (errorCode === "PASSWORD_RESET_REQUIRED") {
          setError("You have reached the 5-device limit. Reset your password to continue.");
          router.push(`/auth/forgot-password?email=${encodeURIComponent(normalizedEmail)}&reason=session-limit`);
          return;
        }

        setError(resolveSecurityTeaseMessage(caughtError) ?? caughtError.message);
      } else {
        setError("Authentication request failed.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="glass-site mesh-gradient relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <div className="grain-overlay pointer-events-none fixed inset-0 z-0"></div>
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/5 blur-[120px]"></div>
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-secondary/5 blur-[120px]"></div>

      <section className="glass-card relative z-10 w-full max-w-[430px] rounded-lg border border-outline-variant/20 p-10 shadow-[0px_0px_36px_rgba(111,77,230,0.1)]">
        <div className="mb-10 text-center">
          <Link href="/" className="mx-auto block w-fit">
            <div className="group mb-6 mx-auto inline-flex h-14 w-14 items-center justify-center rounded-lg bg-surface-container-high shadow-[0px_0px_16px_rgba(111,77,230,0.16)] transition-all duration-300 hover:shadow-[0px_0px_22px_rgba(111,77,230,0.22)]">
              <img
                src="/Media_Assets/EtherSend.png"
                alt="EtherSend logo"
                className="h-9 w-9 object-contain object-center"
              />
            </div>
          </Link>
          <Link href="/" className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">
            EtherSend
          </Link>
          <p className="mt-2 text-[11px] font-label uppercase tracking-widest text-on-surface-variant">Asset Intelligence Portal</p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-low p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setShowPassword(false);
              setShowConfirmPassword(false);
              setError("");
              setStatus("");
            }}
            className={`h-10 rounded-lg text-[11px] font-label uppercase tracking-wider transition-colors ${
              mode === "signin" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setShowPassword(false);
              setShowConfirmPassword(false);
              setError("");
              setStatus("");
            }}
            className={`h-10 rounded-lg text-[11px] font-label uppercase tracking-wider transition-colors ${
              mode === "signup" ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Sign up
          </button>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              startOAuthInSameTab("google");
            }}
            className="group flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-outline-variant/20 bg-surface-container-high transition-all duration-200 active:scale-[0.98] hover:bg-surface-bright"
          >
            <Chrome className="h-4 w-4" />
            <span className="text-xs font-label uppercase tracking-wider text-on-surface">Continue with Google</span>
          </button>

          <button
            type="button"
            onClick={() => {
              startOAuthInSameTab("github");
            }}
            className="group flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-outline-variant/20 bg-surface-container-high transition-all duration-200 active:scale-[0.98] hover:bg-surface-bright"
          >
            <Github className="h-4 w-4" />
            <span className="text-xs font-label uppercase tracking-wider text-on-surface">Continue with GitHub</span>
          </button>
        </div>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-outline-variant/20" />
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">or use email</p>
          <div className="h-px flex-1 bg-outline-variant/20" />
        </div>

        <form
          className="space-y-3"
          onSubmit={(event) => {
            void onAuthSubmit(event);
          }}
        >
          {mode === "signup" ? (
            <input
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              placeholder="Full name (optional)"
              className="h-11 w-full rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0"
            />
          ) : null}

          <input
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            placeholder="Email"
            autoComplete="email"
            className="h-11 w-full rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0"
            required
          />

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              placeholder="Password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="h-11 w-full rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 pr-11 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0"
              required
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

          {mode === "signup" ? (
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                }}
                placeholder="Confirm password"
                autoComplete="new-password"
                className="h-11 w-full rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 pr-11 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0"
                required
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
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 h-11 w-full rounded-lg border border-primary/30 bg-primary/15 text-xs font-label uppercase tracking-widest text-primary transition-colors hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Please wait..." : mode === "signin" ? "Sign in with email" : "Create account"}
          </button>
        </form>

        {mode === "signin" ? (
          <div className="mt-3 text-right">
            <Link href="/auth/forgot-password" className="text-[11px] font-label uppercase tracking-wider text-on-surface-variant hover:text-primary">
              Forgot password?
            </Link>
          </div>
        ) : null}

        {status ? <p className="mt-4 text-xs text-primary">{status}</p> : null}
        {error ? <p className="mt-2 text-xs text-error">{error}</p> : null}

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
