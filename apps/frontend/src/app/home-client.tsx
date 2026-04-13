"use client";

import { useEffect, useState } from "react";
import { ControlShell } from "../components/control-shell";
import { OverviewCards } from "../features/dashboard/overview-cards";
import { PublicLanding } from "../features/dashboard/public-landing";
import { MediaUploader } from "../features/image/image-manager";
import { MediaManager } from "../features/media/media-manager";
import { useAuthSession } from "../hooks/use-auth-session";

const GUEST_MODE_STORAGE_KEY = "lf_guest_mode_enabled";

export default function HomePage() {
  const { user } = useAuthSession();
  const [guestModeEnabled, setGuestModeEnabled] = useState(false);

  useEffect(() => {
    const storedValue = window.localStorage.getItem(GUEST_MODE_STORAGE_KEY);
    setGuestModeEnabled(storedValue === "true");
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    window.localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
    setGuestModeEnabled(false);
  }, [user]);

  function enableGuestMode(): void {
    window.localStorage.setItem(GUEST_MODE_STORAGE_KEY, "true");
    setGuestModeEnabled(true);
  }

  if (!user && !guestModeEnabled) {
    return <PublicLanding onContinueAsGuest={enableGuestMode} />;
  }

  return (
    <ControlShell plainHeader searchPlaceholder="SEARCH ASSETS OR BATCHES...">
      <div className="flex flex-col gap-5">
        <section className="flex flex-wrap items-start justify-between gap-4 md:items-end">
          <div>
            <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface md:text-4xl">System Overview</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Real-time intelligence and asset distribution metrics.</p>
          </div>
        </section>

        <OverviewCards />

        <MediaUploader />

        <MediaManager />
      </div>
    </ControlShell>
  );
}
