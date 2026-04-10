"use client";

import { useEffect, useState } from "react";

export function useThemeMode() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const persisted = window.localStorage.getItem("linkforge-theme") as "light" | "dark" | null;
    const initial = persisted ?? "light";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    window.localStorage.setItem("linkforge-theme", next);
  };

  return { theme, toggleTheme };
}
