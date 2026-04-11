"use client";

import { useEffect, useMemo, useState } from "react";
import { ControlShell } from "../../components/control-shell";
import { fetchAccountInfo, type AccountInfo } from "../../lib/api-client";

function validityLabel(account: AccountInfo | null): string {
  if (!account) {
    return "Uploads live for 10 minutes.";
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
  const isGuest = !account;
  const defaultValidityText = useMemo(() => {
    if (!account) {
      return "Guest media default: 10 minutes";
    }

    return new Date(account.defaultMediaValidityEndsAt).toLocaleString();
  }, [account]);

  const planWindow = useMemo(() => {
    if (!account) {
      return "Uploads live for 10 minutes.";
    }

    if (!account?.planValidUntil) {
      return "No plan expiry available";
    }

    return new Date(account.planValidUntil).toLocaleString();
  }, [account?.planValidUntil]);

  return (
    <ControlShell searchPlaceholder="Search settings, keys, or logs...">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section>
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">Account Settings</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Manage architectural preferences and secure your digital assets.</p>
        </section>

        <section className="grid grid-cols-12 gap-6">
          <article className="glass-card col-span-12 rounded-lg border border-outline-variant/15 p-8 lg:col-span-8">
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Full Name</p>
                <p className="font-headline mt-1 text-lg font-bold text-on-surface">{account?.name || "Guest"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Primary Email</p>
                <p className="font-headline mt-1 text-lg font-bold text-on-surface">{account?.email || "Not signed in"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Role</p>
                <p className="font-headline mt-1 text-lg font-bold text-on-surface">{account?.role ?? "Guest"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Default Validity Ends</p>
                <p className="mt-1 text-sm text-on-surface">{defaultValidityText}</p>
              </div>
            </div>
          </article>

          <article className="glass-card col-span-12 rounded-lg border border-outline-variant/15 p-8 lg:col-span-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Storage Intelligence</p>
            <h3 className="font-headline mt-1 text-2xl font-bold text-on-surface">Policy Window</h3>
            <p className="mt-3 text-sm text-on-surface-variant">{validityText}</p>
            <div className="mt-5 rounded-lg border border-outline-variant/20 bg-surface-container p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Plan Valid Until</p>
              <p className="mt-1 text-sm text-on-surface">{planWindow}</p>
            </div>
            <div className="mt-4 rounded-lg border border-outline-variant/20 bg-surface-container p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Account Type</p>
              <p className="mt-1 text-sm text-on-surface">{typeText}</p>
            </div>
          </article>

          {!isGuest ? (
            <article className="glass-card col-span-12 rounded-lg border border-outline-variant/15 p-8 lg:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Access Security</p>
                  <h3 className="font-headline text-2xl font-bold text-on-surface">Active Sessions</h3>
                </div>
                <button className="text-sm font-semibold text-primary">Revoke All Sessions</button>
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-lg border border-outline-variant/15 bg-surface-container p-4">
                  <p className="text-sm font-bold text-on-surface">Current Browser Session</p>
                  <p className="text-xs text-on-surface-variant">Secure access token in use for this device.</p>
                </div>
                <div className="rounded-lg border border-outline-variant/15 bg-surface-container p-4">
                  <p className="text-sm font-bold text-on-surface">Linked OAuth Session</p>
                  <p className="text-xs text-on-surface-variant">{loading ? "Loading account details..." : "Provider validation synced."}</p>
                </div>
              </div>
            </article>
          ) : null}

          {!isGuest ? (
            <article className="col-span-12 rounded-lg border border-error-container/40 bg-error-container/10 p-8 lg:col-span-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-error">Critical Action</p>
              <h3 className="font-headline mt-1 text-2xl font-bold text-on-surface">Danger Zone</h3>
              <p className="mt-3 text-sm text-on-surface-variant">Deleting your account is irreversible and removes linked assets and data hashes.</p>
              <button className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-error/50 py-3 text-sm font-bold uppercase tracking-widest text-error transition hover:bg-error hover:text-on-error">
                Delete Account Permanently
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </article>
          ) : null}
        </section>

      </div>
    </ControlShell>
  );
}
