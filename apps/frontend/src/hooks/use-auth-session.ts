"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCurrentUser, logoutSession, type AuthUser } from "../lib/api-client";
import { SIGNED_OUT_EVENT } from "../lib/events";

export function useAuthSession() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const currentUser = await fetchCurrentUser();
    setUser(currentUser);
    setLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    setUser(null);
    setLoading(false);
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    await logoutSession();
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
