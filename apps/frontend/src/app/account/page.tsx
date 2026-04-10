"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DashboardHeader } from "../../components/dashboard-header";
import { fetchAccountInfo, type AccountInfo } from "../../lib/api-client";

function validityLabel(account: AccountInfo | null): string {
  if (!account) {
    return "Guest uploads expire in 10 minutes.";
  }

  if (account.accountType === "SUBSCRIPTION") {
    const plan = account.planName || "Plan subscription";
    const validUntil = account.planValidUntil ? new Date(account.planValidUntil).toLocaleString() : "Unknown";
    return `${plan} valid until ${validUntil}`;
  }

  return "Signed-in free account: media validity defaults to 6 months per upload.";
}

function accountTypeLabel(account: AccountInfo | null): string {
  if (!account) {
    return "Guest";
  }

  return account.accountType === "SUBSCRIPTION" ? "Subscriber (plan-based validity)" : "Free user (6 months)";
}

export default function AccountPage() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const info = await fetchAccountInfo();
      setAccount(info);
      setLoading(false);
    }

    void load();
  }, []);

  const validityText = useMemo(() => validityLabel(account), [account]);
  const typeText = useMemo(() => accountTypeLabel(account), [account]);

  return (
    <main className="min-h-screen px-4 py-8 md:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <DashboardHeader />

        <section className="rounded-3xl border border-border bg-card p-6 shadow-lift">
          <h1 className="text-2xl font-semibold">Account</h1>
          <p className="mt-2 text-sm opacity-80">Account type, validity policy, and subscription window.</p>

          {loading ? (
            <p className="mt-4 text-sm">Loading account details...</p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-border bg-bg/70 p-4">
                <p className="text-xs uppercase tracking-widest text-accent">Account Type</p>
                <p className="mt-1 text-lg font-semibold">{typeText}</p>
              </div>

              <div className="rounded-2xl border border-border bg-bg/70 p-4">
                <p className="text-xs uppercase tracking-widest text-accent">Validity</p>
                <p className="mt-1 text-sm">{validityText}</p>
              </div>

              <div className="rounded-2xl border border-border bg-bg/70 p-4">
                <p className="text-xs uppercase tracking-widest text-accent">Email</p>
                <p className="mt-1 text-sm">{account?.email ?? "Not signed in"}</p>
              </div>

              <div className="rounded-2xl border border-border bg-bg/70 p-4">
                <p className="text-xs uppercase tracking-widest text-accent">Role</p>
                <p className="mt-1 text-sm">{account?.role ?? "Guest"}</p>
              </div>
            </div>
          )}

          <Link href="/" className="mt-5 inline-flex rounded-xl border border-border bg-bg px-3 py-2 text-sm hover:opacity-90">
            Back to dashboard
          </Link>
        </section>
      </div>
    </main>
  );
}
