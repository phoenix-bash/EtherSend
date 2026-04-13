"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ApiError, verifyEmailToken } from "../../../lib/api-client";

type VerifyStatus = "loading" | "success" | "error";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<VerifyStatus>("loading");
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    let active = true;

    async function runVerification(): Promise<void> {
      if (!token) {
        if (!active) {
          return;
        }

        setStatus("error");
        setMessage("Verification token is missing.");
        return;
      }

      try {
        await verifyEmailToken(token);

        if (!active) {
          return;
        }

        setStatus("success");
        setMessage("Email verified. You can now sign in.");
      } catch (caughtError) {
        if (!active) {
          return;
        }

        if (caughtError instanceof ApiError) {
          setMessage(caughtError.message);
        } else {
          setMessage("Verification failed.");
        }
        setStatus("error");
      }
    }

    void runVerification();

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="glass-site mesh-gradient relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-10">
      <section className="glass-card relative z-10 w-full max-w-[430px] rounded-lg border border-outline-variant/20 p-8">
        <p className="text-[11px] font-label uppercase tracking-widest text-on-surface-variant">Account verification</p>
        <h1 className="mt-2 font-headline text-3xl font-extrabold tracking-tight text-on-surface">Verify Email</h1>
        <p className="mt-4 text-sm text-on-surface-variant">{message}</p>

        <div className="mt-6 rounded-lg border border-outline-variant/20 bg-surface-container p-4">
          {status === "loading" ? <p className="text-xs text-primary">Processing token...</p> : null}
          {status === "success" ? <p className="text-xs text-primary">Verification completed successfully.</p> : null}
          {status === "error" ? <p className="text-xs text-error">Unable to verify this token.</p> : null}
        </div>

        <div className="mt-6 flex items-center gap-3">
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
