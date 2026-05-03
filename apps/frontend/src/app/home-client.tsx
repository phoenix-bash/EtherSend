"use client";

import { useEffect, useRef, useState } from "react";
import { ControlShell } from "../components/control-shell";
import { OverviewCards } from "../features/dashboard/overview-cards";
import { PublicLanding } from "../features/dashboard/public-landing";
import { MediaUploader } from "../features/image/image-manager";
import { MediaManager } from "../features/media/media-manager";
import { useDominatorActivation } from "../hooks/use-dominator-activation";
import { useAuthSession } from "../hooks/use-auth-session";

const GUEST_MODE_STORAGE_KEY = "lf_guest_mode_enabled";
const GUEST_MODE_EXPIRES_AT_KEY = "lf_guest_mode_expires_at";
const GUEST_SESSION_TTL_MS = 15 * 60 * 1000;
const GUEST_SESSION_REDIRECT_DELAY_MS = 4000;

function clearGuestModeState(): void {
  window.localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
  window.localStorage.removeItem(GUEST_MODE_EXPIRES_AT_KEY);
}

function enableGuestModeState(): void {
  window.localStorage.setItem(GUEST_MODE_STORAGE_KEY, "true");
  window.localStorage.setItem(GUEST_MODE_EXPIRES_AT_KEY, String(Date.now() + GUEST_SESSION_TTL_MS));
}

function isGuestModeActiveAndFresh(): boolean {
  const modeEnabled = window.localStorage.getItem(GUEST_MODE_STORAGE_KEY) === "true";
  if (!modeEnabled) {
    return false;
  }

  const expiresAtRaw = window.localStorage.getItem(GUEST_MODE_EXPIRES_AT_KEY);
  if (!expiresAtRaw) {
    enableGuestModeState();
    return true;
  }

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    clearGuestModeState();
    return false;
  }

  return true;
}

export default function HomePage() {
  const { user } = useAuthSession();
  useDominatorActivation({ enabled: Boolean(user) });
  const [guestModeEnabled, setGuestModeEnabled] = useState(false);
  const [guestSessionExpiredNotice, setGuestSessionExpiredNotice] = useState(false);
  const [guestRedirectCountdown, setGuestRedirectCountdown] = useState(
    Math.ceil(GUEST_SESSION_REDIRECT_DELAY_MS / 1000)
  );
  const guestExpiryTimeoutRef = useRef<number | null>(null);

  function triggerGuestSessionExpiredFlow(): void {
    if (guestSessionExpiredNotice) {
      return;
    }

    clearGuestModeState();
    setGuestSessionExpiredNotice(true);
    setGuestRedirectCountdown(Math.ceil(GUEST_SESSION_REDIRECT_DELAY_MS / 1000));

    if (guestExpiryTimeoutRef.current) {
      window.clearTimeout(guestExpiryTimeoutRef.current);
    }

    guestExpiryTimeoutRef.current = window.setTimeout(() => {
      setGuestSessionExpiredNotice(false);
      setGuestModeEnabled(false);
      guestExpiryTimeoutRef.current = null;
    }, GUEST_SESSION_REDIRECT_DELAY_MS);
  }

  useEffect(() => {
    const active = isGuestModeActiveAndFresh();
    setGuestModeEnabled(active);

    if (!active) {
      clearGuestModeState();
    }

    return () => {
      if (guestExpiryTimeoutRef.current) {
        window.clearTimeout(guestExpiryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    if (guestExpiryTimeoutRef.current) {
      window.clearTimeout(guestExpiryTimeoutRef.current);
      guestExpiryTimeoutRef.current = null;
    }

    clearGuestModeState();
    setGuestModeEnabled(false);
    setGuestSessionExpiredNotice(false);
  }, [user]);

  useEffect(() => {
    if (user || !guestModeEnabled || guestSessionExpiredNotice) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const stillActive = isGuestModeActiveAndFresh();
      if (!stillActive) {
        triggerGuestSessionExpiredFlow();
      }
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [guestModeEnabled, guestSessionExpiredNotice, user]);

  useEffect(() => {
    if (user || !guestModeEnabled || guestSessionExpiredNotice) {
      return;
    }

    const refreshExpiry = () => {
      window.localStorage.setItem(GUEST_MODE_EXPIRES_AT_KEY, String(Date.now() + GUEST_SESSION_TTL_MS));
    };

    const events: Array<keyof WindowEventMap> = ["click", "keydown", "mousemove", "scroll", "touchstart"];
    events.forEach((eventName) => {
      window.addEventListener(eventName, refreshExpiry, { passive: true });
    });

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, refreshExpiry);
      });
    };
  }, [guestModeEnabled, guestSessionExpiredNotice, user]);

  useEffect(() => {
    if (!guestSessionExpiredNotice) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setGuestRedirectCountdown((previous) => (previous > 1 ? previous - 1 : 1));
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [guestSessionExpiredNotice]);

  function enableGuestMode(): void {
    enableGuestModeState();
    setGuestModeEnabled(true);
    setGuestSessionExpiredNotice(false);
  }

  if (!user && !guestModeEnabled && !guestSessionExpiredNotice) {
    return <PublicLanding onContinueAsGuest={enableGuestMode} />;
  }

  return (
    <>
      <ControlShell plainHeader searchPlaceholder="SEARCH ASSETS OR BATCHES...">
        <div className="-mx-3 flex flex-col gap-5 md:-mx-6">
          <OverviewCards />

          <MediaUploader />

          <MediaManager />
        </div>
      </ControlShell>

      {guestSessionExpiredNotice ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-6">
          <div className="w-full max-w-md rounded-2xl border border-outline-variant/25 bg-surface-container p-6 shadow-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">Guest Session</p>
            <h2 className="mt-2 text-xl font-semibold text-on-surface">Session expired</h2>
            <p className="mt-3 text-sm text-on-surface-variant">
              Your guest session has expired after inactivity. Redirecting you to the landing page in {guestRedirectCountdown}s.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
