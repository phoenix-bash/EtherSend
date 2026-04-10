"use client";

import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { useThemeMode } from "../hooks/use-theme";
import { useAuthSession } from "../hooks/use-auth-session";

export function DashboardHeader() {
  const { theme, toggleTheme } = useThemeMode();
  const { user, loading, signOut } = useAuthSession();

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-card/90 p-4 shadow-lift md:p-6"
    >
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-accent">LinkForge Control Plane</p>
        <h1 className="text-2xl font-semibold md:text-3xl">Persistent Media & Link Dashboard</h1>
      </div>

      <div className="flex items-center gap-2">
        {loading ? (
          <span className="rounded-xl border border-border bg-bg px-3 py-2 text-sm">Checking session...</span>
        ) : user ? (
          <>
            <span className="rounded-xl border border-border bg-bg px-3 py-2 text-sm">{user.name || user.email}</span>
            <Link href="/account" className="rounded-xl border border-border bg-bg px-3 py-2 text-sm hover:opacity-90">
              Account
            </Link>
            <button
              type="button"
              onClick={() => {
                void signOut();
              }}
              className="rounded-xl border border-border bg-bg px-3 py-2 text-sm hover:opacity-90"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link href="/auth/signin" className="rounded-xl border border-border bg-bg px-3 py-2 text-sm hover:opacity-90">
            Sign in
          </Link>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2 text-sm hover:opacity-90"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </div>
    </motion.header>
  );
}
