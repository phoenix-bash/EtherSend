"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ControlShell } from "../../components/control-shell";
import {
  ApiError,
  deleteAccountPermanently,
  fetchAccountInfo,
  listActiveSessions,
  logoutSession,
  requestPasswordReset,
  requestAccountDeletionVerification,
  revokeActiveSession,
  type AccountInfo,
  type ActiveSessionItem
} from "../../lib/api-client";
import { getOrCreateGuestPokemonAlias } from "../../lib/guest-alias";
import { useDominatorActivation } from "../../hooks/use-dominator-activation";
import { useAuthSession } from "../../hooks/use-auth-session";
import { formatDateTimeDdMmYyyyHm } from "../../lib/utils";

const RETENTION_QUOTES = [
  "Our servers would miss your dramatic tab switching.",
  "Stay a little longer, your pixels still have dreams.",
  "If you leave now, the upload progress bar will cry.",
  "Your media library asked for one more chance.",
  "Deleting this account may disturb nearby memes.",
  "Even the cache is emotionally attached to you."
];

function validityLabel(account: AccountInfo | null): string {
  if (!account) {
    return "Uploads live for 10 minutes.";
  }

  if (account.accountType === "SUBSCRIPTION") {
    const plan = account.planName || "Plan subscription";
    const validUntil = account.planValidUntil ? formatDateTimeDdMmYyyyHm(account.planValidUntil) : "Unknown";
    return `${plan} valid until ${validUntil}`;
  }

  return "Signed-in free account media validity follows your current default policy.";
}

function accountTypeLabel(account: AccountInfo | null, guestAlias: string): string {
  if (!account) {
    return `Guest (${guestAlias})`;
  }

  return account.accountType === "SUBSCRIPTION" ? "Subscriber (plan-based validity)" : "Free user";
}

function deriveConfirmationPhrase(quote: string): string {
  const candidates = (quote.match(/[A-Za-z]+/g) ?? [])
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 4 && word.length <= 15);

  if (candidates.length === 0) {
    return "staywithus";
  }

  return candidates[Math.floor(Math.random() * candidates.length)] ?? "staywithus";
}

function formatSessionTitle(session: ActiveSessionItem): string {
  if (session.deviceModel) {
    return session.deviceModel;
  }

  if (session.deviceType === "mobile") {
    return "Mobile device";
  }

  if (session.deviceType === "tablet") {
    return "Tablet";
  }

  return "Desktop browser";
}

function formatSessionMeta(session: ActiveSessionItem): string {
  const parts = [session.browser, session.os].filter(Boolean);
  if (parts.length === 0) {
    return "Unknown browser and OS";
  }

  return parts.join(" on ");
}

export default function AccountPage() {
  const router = useRouter();
  const { user } = useAuthSession();
  useDominatorActivation({ enabled: Boolean(user) });
  const [guestAlias, setGuestAlias] = useState("Pikachu");
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<AccountInfo | null>(null);

  const [sessions, setSessions] = useState<ActiveSessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionActionId, setSessionActionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetMessage, setPasswordResetMessage] = useState("");

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteQuote, setDeleteQuote] = useState("");
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteVerificationCode, setDeleteVerificationCode] = useState("");
  const [deleteVerificationRequested, setDeleteVerificationRequested] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionError("");

    try {
      const result = await listActiveSessions();
      setSessions(result.items);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setSessionError(caughtError.message);
      } else {
        setSessionError("Unable to load active sessions.");
      }
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    setGuestAlias(getOrCreateGuestPokemonAlias());
  }, []);

  useEffect(() => {
    async function loadAccount(): Promise<void> {
      const info = await fetchAccountInfo();
      setAccount(info);
      setLoading(false);

      if (info) {
        await loadSessions();
      }
    }

    void loadAccount();
  }, [loadSessions]);

  const validityText = useMemo(() => validityLabel(account), [account]);
  const typeText = useMemo(() => accountTypeLabel(account, guestAlias), [account, guestAlias]);
  const isGuest = !account;

  const planWindow = useMemo(() => {
    if (!account) {
      return "Uploads live for 10 minutes.";
    }

    if (account.planValidUntil) {
      return formatDateTimeDdMmYyyyHm(account.planValidUntil);
    }

    return formatDateTimeDdMmYyyyHm(account.defaultMediaValidityEndsAt);
  }, [account]);

  const deletePhraseMatches = deleteConfirmation.trim().toLowerCase() === deletePhrase.toLowerCase();

  function openDeleteModal(): void {
    const randomQuote = RETENTION_QUOTES[Math.floor(Math.random() * RETENTION_QUOTES.length)] ?? RETENTION_QUOTES[0];
    const phrase = deriveConfirmationPhrase(randomQuote);

    setDeleteQuote(randomQuote);
    setDeletePhrase(phrase);
    setDeleteConfirmation("");
    setDeleteVerificationCode("");
    setDeleteVerificationRequested(false);
    setDeleteError("");
    setDeleteModalOpen(true);
  }

  async function handleRequestDeleteVerification(): Promise<void> {
    if (!deletePhraseMatches || deletePhrase.length === 0) {
      return;
    }

    setDeleteSubmitting(true);
    setDeleteError("");

    try {
      await requestAccountDeletionVerification(deleteConfirmation.trim());
      setDeleteVerificationRequested(true);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setDeleteError(caughtError.message);
      } else {
        setDeleteError("Unable to send deletion verification email.");
      }
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function handleRevokeSession(sessionId: string): Promise<void> {
    setSessionActionId(sessionId);
    setSessionError("");

    try {
      const result = await revokeActiveSession(sessionId);
      if (result.currentSessionRevoked) {
        await logoutSession();
        router.push("/auth/signin");
        return;
      }

      await loadSessions();
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setSessionError(caughtError.message);
      } else {
        setSessionError("Unable to revoke this session.");
      }
    } finally {
      setSessionActionId(null);
    }
  }

  async function handlePermanentDelete(): Promise<void> {
    if (!deletePhraseMatches || deletePhrase.length === 0 || deleteVerificationCode.trim().length !== 6) {
      return;
    }

    setDeleteSubmitting(true);
    setDeleteError("");

    try {
      await deleteAccountPermanently(deleteConfirmation.trim(), deleteVerificationCode.trim());
      await logoutSession();
      router.push("/auth/signin");
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setDeleteError(caughtError.message);
      } else {
        setDeleteError("Unable to delete account permanently.");
      }
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function handleRequestPasswordReset(): Promise<void> {
    if (!account?.email) {
      return;
    }

    setPasswordResetLoading(true);
    setPasswordResetMessage("");

    try {
      await requestPasswordReset(account.email);
      setPasswordResetMessage("Password reset link sent to your email.");
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setPasswordResetMessage(caughtError.message);
      } else {
        setPasswordResetMessage("Unable to send password reset link.");
      }
    } finally {
      setPasswordResetLoading(false);
    }
  }

  return (
    <ControlShell searchPlaceholder="Search settings, keys, or logs...">
      <div className="flex w-full flex-col gap-6">
        <section>
          <h2 className="font-headline text-4xl font-extrabold tracking-tight text-on-surface">Account Settings</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Manage architectural preferences and secure your digital assets.</p>
        </section>

        <section className="grid grid-cols-12 gap-4">
          <article className="glass-card col-span-12 rounded-lg border border-outline-variant/15 p-5 lg:col-span-8 md:p-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Full Name</p>
                <p className="font-headline mt-1 text-lg font-bold text-on-surface">{account?.name || guestAlias}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Primary Email</p>
                <p className="font-headline mt-1 text-lg font-bold text-on-surface">{account?.email || "Not signed in"}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Role</p>
                <p className="font-headline mt-1 text-lg font-bold text-on-surface">{account?.role ?? "Pokemon"}</p>
              </div>
            </div>

            {!isGuest ? (
              <div className="mt-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Change Password</p>
                <p className="mt-2 text-sm text-on-surface-variant">A reset link will be sent to your registered email. You can set a new password from that link.</p>
                <button
                  type="button"
                  disabled={passwordResetLoading}
                  onClick={() => {
                    void handleRequestPasswordReset();
                  }}
                  className="mt-3 inline-flex h-10 items-center justify-center rounded-lg border border-outline-variant/30 px-4 text-xs font-bold uppercase tracking-wider text-on-surface transition hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {passwordResetLoading ? "Sending..." : "Send password reset link"}
                </button>
                {passwordResetMessage ? <p className="mt-2 text-xs text-on-surface-variant">{passwordResetMessage}</p> : null}
              </div>
            ) : null}
          </article>

          <article className="glass-card col-span-12 rounded-lg border border-outline-variant/15 p-5 lg:col-span-4 md:p-6">
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
            <article className="glass-card col-span-12 rounded-lg border border-outline-variant/15 p-5 lg:col-span-8 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Access Security</p>
                  <h3 className="font-headline text-2xl font-bold text-on-surface">Active Sessions</h3>
                </div>
                <p className="text-xs text-on-surface-variant">Maximum 5 active sessions</p>
              </div>

              {sessionError ? <p className="mt-3 text-xs text-error">{sessionError}</p> : null}

              <div className="mt-5 space-y-3">
                {sessionsLoading ? (
                  <div className="rounded-lg border border-outline-variant/15 bg-surface-container p-4">
                    <p className="text-xs text-on-surface-variant">Loading active sessions...</p>
                  </div>
                ) : null}

                {!sessionsLoading && sessions.length === 0 ? (
                  <div className="rounded-lg border border-outline-variant/15 bg-surface-container p-4">
                    <p className="text-xs text-on-surface-variant">No active sessions found.</p>
                  </div>
                ) : null}

                {!sessionsLoading
                  ? sessions.map((session) => (
                      <div key={session.id} className="rounded-lg border border-outline-variant/15 bg-surface-container p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-on-surface">
                              {formatSessionTitle(session)}
                              {session.current ? (
                                <span className="ml-2 rounded-full border border-primary/30 bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-primary">
                                  current
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-on-surface-variant">{formatSessionMeta(session)}</p>
                            <p className="mt-1 text-[11px] text-on-surface-variant">
                              Last active: {formatDateTimeDdMmYyyyHm(session.lastActivityAt)} • Expires: {formatDateTimeDdMmYyyyHm(session.expiresAt)}
                            </p>
                            {session.ipAddress ? <p className="text-[11px] text-on-surface-variant">IP: {session.ipAddress}</p> : null}
                          </div>

                          <button
                            type="button"
                            disabled={sessionActionId === session.id}
                            onClick={() => {
                              void handleRevokeSession(session.id);
                            }}
                            className="inline-flex items-center justify-center rounded-lg border border-outline-variant/30 px-3 py-2 text-xs font-bold uppercase tracking-wider text-on-surface transition hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {sessionActionId === session.id ? "Revoking..." : "Revoke"}
                          </button>
                        </div>
                      </div>
                    ))
                  : null}
              </div>
            </article>
          ) : null}

          {!isGuest ? (
            <article className="col-span-12 rounded-lg border border-error-container/40 bg-error-container/10 p-5 lg:col-span-4 md:p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-error">Critical Action</p>
              <h3 className="font-headline mt-1 text-2xl font-bold text-on-surface">Danger Zone</h3>
              <p className="mt-3 text-sm text-on-surface-variant">Deleting your account is irreversible and removes linked assets and data hashes.</p>
              <button
                type="button"
                onClick={openDeleteModal}
                className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-lg border border-error/50 px-4 text-center text-sm font-bold uppercase tracking-widest leading-none text-error transition hover:bg-error hover:text-on-error"
              >
                Delete Account Permanently
              </button>
            </article>
          ) : null}
        </section>
      </div>

      {deleteModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-lg border border-outline-variant/30 bg-surface p-6 shadow-2xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-error">Final confirmation</p>
            <h3 className="mt-2 font-headline text-2xl font-bold text-on-surface">Delete Account Permanently</h3>
            <p className="mt-3 text-sm text-on-surface-variant">This is irreversible. All account-owned data and session access will be removed.</p>

            <div className="mt-4 rounded-lg border border-outline-variant/20 bg-surface-container p-3">
              <p className="text-xs text-on-surface-variant">{deleteQuote}</p>
            </div>

            <div className="mt-4 rounded-lg border border-outline-variant/20 bg-surface-container p-3">
              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">Type this phrase to confirm</p>
              <p className="mt-1 text-sm font-bold text-on-surface">{deletePhrase}</p>
            </div>

            <input
              type="text"
              value={deleteConfirmation}
              onChange={(event) => {
                const normalized = event.target.value.replace(/[^a-zA-Z]/g, "").slice(0, 15);
                setDeleteConfirmation(normalized);
              }}
              placeholder="Enter confirmation phrase"
              maxLength={15}
              className="mt-4 h-11 w-full rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0"
            />

            {deleteVerificationRequested ? (
              <input
                type="text"
                value={deleteVerificationCode}
                onChange={(event) => {
                  const normalized = event.target.value.replace(/[^0-9]/g, "").slice(0, 6);
                  setDeleteVerificationCode(normalized);
                }}
                placeholder="Enter 6-digit email verification code"
                maxLength={6}
                className="mt-3 h-11 w-full rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0"
              />
            ) : null}

            {deleteError ? <p className="mt-3 text-xs text-error">{deleteError}</p> : null}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (deleteSubmitting) {
                    return;
                  }
                  setDeleteModalOpen(false);
                }}
                className="rounded-lg border border-outline-variant/25 px-4 py-2 text-xs font-bold uppercase tracking-wider text-on-surface-variant transition hover:text-on-surface"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!deletePhraseMatches || deleteSubmitting}
                onClick={() => {
                  if (deleteVerificationRequested) {
                    void handlePermanentDelete();
                    return;
                  }

                  void handleRequestDeleteVerification();
                }}
                className="rounded-lg border border-error/50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-error transition hover:bg-error hover:text-on-error disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleteSubmitting ? "Processing..." : deleteVerificationRequested ? "Delete permanently" : "Send verification code"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ControlShell>
  );
}
