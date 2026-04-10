"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCurrentUser, logoutSession, type AuthUser } from "../lib/api-client";

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
    await logoutSession();
    setUser(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    user,
    loading,
    refresh,
    signOut
  };
}
