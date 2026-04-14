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
        <OverviewCards />

        <MediaUploader />

        <MediaManager />
      </div>
    </ControlShell>
  );
}
