"use client";

import { useEffect, useState } from "react";

const THEME_STORAGE_KEY = "lf_theme_mode";
type ThemeMode = "light" | "dark";

export function useThemeMode() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  const applyTheme = (nextTheme: ThemeMode): void => {
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  };

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      applyTheme(storedTheme);
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    applyTheme(mediaQuery.matches ? "dark" : "light");

    const handleSystemThemeChange = (event: MediaQueryListEvent): void => {
      applyTheme(event.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, []);

  const toggleTheme = (): void => {
    applyTheme(theme === "dark" ? "light" : "dark");
  };

  return { theme, toggleTheme };
}
