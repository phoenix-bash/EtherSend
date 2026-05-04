"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCurrentUser, logoutSession, type AuthUser } from "../lib/api-client";
import { SIGNED_OUT_EVENT } from "../lib/events";

const GUEST_MODE_STORAGE_KEY = "lf_guest_mode_enabled";
const GUEST_MODE_EXPIRES_AT_KEY = "lf_guest_mode_expires_at";

function clearGuestModeState(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(GUEST_MODE_STORAGE_KEY);
  window.localStorage.removeItem(GUEST_MODE_EXPIRES_AT_KEY);
}

export function useAuthSession() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const currentUser = await fetchCurrentUser();
    if (currentUser) {
      clearGuestModeState();
    }
    setUser(currentUser);
    setLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    setLoading(false);
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    try {
      await logoutSession();
    } finally {
      window.location.replace("/");
    }
  }, []);

  useEffect(() => {
    function onSignedOut(): void {
      setUser(null);
      setLoading(false);
    }

    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);
    void refresh();

    return () => {
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
    };
  }, [refresh]);

  return {
    user,
    loading,
    refresh,
    signOut
  };
}
