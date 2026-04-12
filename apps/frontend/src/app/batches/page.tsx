"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ControlShell } from "../../components/control-shell";
import { QRCodeSVG } from "qrcode.react";
import { listBatches, updateBatchShare, type BatchListItem } from "../../lib/api-client";
import { MEDIA_LIBRARY_CHANGED_EVENT, MEDIA_UPLOADED_EVENT, SIGNED_OUT_EVENT } from "../../lib/events";
import { formatDateDdMmYyyy } from "../../lib/utils";

function formatBatchName(batch: BatchListItem): string {
  if (batch.name && batch.name.trim()) {
    return batch.name;
  }

  return `Batch ${batch.id.slice(0, 8)}`;
}

function formatCountdown(expiresAt: string, nowMs: number): string {
  const remainingMs = new Date(expiresAt).getTime() - nowMs;
  if (remainingMs <= 0) {
    return "Expired";
  }

  const totalMinutes = Math.floor(remainingMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export default function BatchesPage() {
  const searchParams = useSearchParams();
  const batchIdFromQuery = searchParams.get("batchId");
  const batchQuery = (searchParams.get("q") ?? "").trim().toLowerCase();

  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [origin, setOrigin] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [updatingBatchIds, setUpdatingBatchIds] = useState<string[]>([]);

  async function refreshBatches(): Promise<void> {
    setLoading(true);
    try {
      const { items } = await listBatches();
      setBatches(items);
      setStatus("");
    } catch {
      setBatches([]);
      setStatus("Unable to load batches for this session.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    void refreshBatches();

    function onBatchRelatedChange(): void {
      void refreshBatches();
    }

    function onSignedOut(): void {
      setBatches([]);
      setStatus("");
    }

    window.addEventListener(MEDIA_UPLOADED_EVENT, onBatchRelatedChange);
    window.addEventListener(MEDIA_LIBRARY_CHANGED_EVENT, onBatchRelatedChange);
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);

    return () => {
      window.removeEventListener(MEDIA_UPLOADED_EVENT, onBatchRelatedChange);
      window.removeEventListener(MEDIA_LIBRARY_CHANGED_EVENT, onBatchRelatedChange);
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const sharedBatches = useMemo(() => {
    const shared = batches.filter((batch) => batch.share);
    if (!batchQuery) {
      return shared;
    }

    return shared.filter((batch) => `${formatBatchName(batch)} ${batch.id}`.toLowerCase().includes(batchQuery));
  }, [batchQuery, batches]);

  async function copyBatchUrl(url: string): Promise<void> {
    await navigator.clipboard.writeText(url);
    setStatus("Batch URL copied.");
  }

  async function setBatchDownloadAccess(batchId: string, allowDownload: boolean): Promise<void> {
    setUpdatingBatchIds((current) => {
      if (current.includes(batchId)) {
        return current;
      }

      return [...current, batchId];
    });

    try {
      const { share } = await updateBatchShare(batchId, allowDownload);
      setBatches((current) =>
        current.map((batch) => {
          if (batch.id !== batchId || !batch.share) {
            return batch;
          }

          return {
            ...batch,
            share: {
              ...batch.share,
              token: share.token,
              allowDownload: share.allowDownload,
              expiresAt: share.expiresAt,
              publicPath: share.publicPath,
              publicUrl: share.publicUrl
            }
          };
        })
      );
      setStatus(allowDownload ? "" : "Batch download disabled.");
    } catch {
      setStatus("Unable to update batch download setting.");
    } finally {
      setUpdatingBatchIds((current) => current.filter((id) => id !== batchId));
    }
  }

  return (
    <ControlShell searchPlaceholder="Search batch names...">
      <div className="flex flex-col gap-6">
        <section>
          <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface md:text-4xl">Batches</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Only your created media batches are shown here.</p>
        </section>

        <section className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-5">
          {status ? <p className="text-xs text-on-surface-variant">{status}</p> : null}

          {batchQuery ? <p className="mt-1 text-[10px] uppercase tracking-wider text-primary">Filtered by search: {searchParams.get("q")}</p> : null}

          {loading ? <p className="mt-3 text-sm text-on-surface-variant">Loading batches...</p> : null}

          {!loading && sharedBatches.length === 0 ? (
            <p className="mt-3 text-sm text-on-surface-variant">{batchQuery ? "No batches matched this search." : "Batches will appear here once you create a media batch."}</p>
          ) : null}

          {!loading && sharedBatches.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {sharedBatches.map((batch) => {
                if (!batch.share) {
                  return null;
                }

                const share = batch.share;
                const shareUrl = share.publicUrl ?? `${origin}${share.publicPath}`;
                const expiresAtLabel = formatDateDdMmYyyy(share.expiresAt);
                const countdown = formatCountdown(share.expiresAt, nowMs);
                const isUpdating = updatingBatchIds.includes(batch.id);
                const focusedBySuggestion = batch.id === batchIdFromQuery;

                return (
                  <article
                    key={batch.id}
                    className={`rounded-lg border bg-surface-container p-4 ${
                      focusedBySuggestion ? "border-primary/35 shadow-[inset_0_0_0_1px_rgba(75,188,214,0.18)]" : "border-outline-variant/15"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Batch Name</p>
                        <h3 className="mt-1 font-headline text-xl font-bold text-on-surface">{formatBatchName(batch)}</h3>
                        <p className="mt-1 text-xs text-on-surface-variant">{batch.fileCount} file{batch.fileCount === 1 ? "" : "s"}</p>
                      </div>

                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Expiry</p>
                        <p className="mt-1 text-xs font-semibold text-on-surface">{expiresAtLabel}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-wider text-primary">{countdown}</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-lg border border-outline-variant/15 bg-surface-container-low p-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Batch URL</p>
                      <p className="mt-1 break-all text-xs text-on-surface">{shareUrl}</p>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-outline-variant/15 bg-surface-container-low p-3">
                      <div className="rounded-lg bg-white p-2">
                        <QRCodeSVG value={shareUrl} size={96} includeMargin />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Share QR</p>
                        <p className="mt-1 text-xs text-on-surface-variant">Scan to open this batch on mobile.</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface transition-colors hover:text-primary"
                        onClick={() => {
                          void copyBatchUrl(shareUrl);
                        }}
                      >
                        Copy URL
                      </button>

                      <a
                        href={shareUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary/20"
                      >
                        Open Batch
                      </a>

                      <div
                        className={`inline-flex items-center gap-2 rounded-lg border border-outline-variant/24 bg-surface-container-high px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface ${
                          isUpdating ? "opacity-70" : ""
                        }`}
                      >
                        <span>Allow Download</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={share.allowDownload}
                          aria-label="Allow download for this batch"
                          disabled={isUpdating}
                          className={`relative inline-flex h-5 w-10 items-center rounded-full border border-outline-variant/65 shadow-inner transition-colors ${
                            share.allowDownload
                              ? "bg-primary"
                              : "bg-surface-container-low"
                          }`}
                          onClick={() => {
                            void setBatchDownloadAccess(batch.id, !share.allowDownload);
                          }}
                        >
                          <span
                            className={`absolute left-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-white/70 bg-white/95 shadow-sm transition-transform dark:border-slate-200/35 dark:bg-slate-100/85 ${
                              share.allowDownload ? "translate-x-5" : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </ControlShell>
  );
}
