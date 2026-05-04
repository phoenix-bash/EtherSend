"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ControlShell } from "../../components/control-shell";
import { QRCodeSVG } from "qrcode.react";
import { copyTextToClipboard } from "../../lib/clipboard";
import { deleteBatch, listBatches, updateBatchShare, type BatchListItem } from "../../lib/api-client";
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
  const [copiedBatchId, setCopiedBatchId] = useState<string | null>(null);

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

  async function setBatchHideFilenames(batchId: string, allowDownload: boolean, hideFilenames: boolean): Promise<void> {
    setUpdatingBatchIds((current) => {
      if (current.includes(batchId)) {
        return current;
      }

      return [...current, batchId];
    });

    try {
      const { share } = await updateBatchShare(batchId, allowDownload, hideFilenames);
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
              hideFilenames: share.hideFilenames,
              previewViewLimit: share.previewViewLimit,
              expiresAt: share.expiresAt,
              publicPath: share.publicPath,
              publicUrl: share.publicUrl
            }
          };
        })
      );
      setStatus(hideFilenames ? "Filenames hidden on shared page." : "Filenames visible on shared page.");
    } catch {
      setStatus("Unable to update shared filename visibility.");
    } finally {
      setUpdatingBatchIds((current) => current.filter((id) => id !== batchId));
    }
  }

  async function removeBatch(batchId: string, batchName: string): Promise<void> {
    const confirmed = window.confirm(`Delete ${batchName}? This removes only the batch and shared link, not media files.`);
    if (!confirmed) {
      return;
    }

    setUpdatingBatchIds((current) => {
      if (current.includes(batchId)) {
        return current;
      }

      return [...current, batchId];
    });

    try {
      await deleteBatch(batchId);
      setBatches((current) => current.filter((batch) => batch.id !== batchId));
      setStatus("Batch deleted.");
    } catch {
      setStatus("Unable to delete batch.");
    } finally {
      setUpdatingBatchIds((current) => current.filter((id) => id !== batchId));
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

  useEffect(() => {
    if (!copiedBatchId) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopiedBatchId(null);
    }, 1800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [copiedBatchId]);

  const sharedBatches = useMemo(() => {
    const shared = batches.filter((batch) => batch.share);
    if (!batchQuery) {
      return shared;
    }

    return shared.filter((batch) => `${formatBatchName(batch)} ${batch.id}`.toLowerCase().includes(batchQuery));
  }, [batchQuery, batches]);

  async function copyBatchUrl(batchId: string, url: string): Promise<void> {
    const copied = await copyTextToClipboard(url);
    if (copied) {
      setCopiedBatchId(batchId);
      setStatus("Batch URL copied.");
      return;
    }

    setStatus("Failed to copy batch URL on this device.");
  }

  async function setBatchDownloadAccess(batchId: string, allowDownload: boolean, hideFilenames: boolean): Promise<void> {
    setUpdatingBatchIds((current) => {
      if (current.includes(batchId)) {
        return current;
      }

      return [...current, batchId];
    });

    try {
      const { share } = await updateBatchShare(batchId, allowDownload, hideFilenames);
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
              hideFilenames: share.hideFilenames,
              previewViewLimit: share.previewViewLimit,
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

        <section>
          {status ? <p className="text-xs text-on-surface-variant">{status}</p> : null}

          {batchQuery ? <p className="mt-1 text-[10px] uppercase tracking-wider text-primary">Filtered by search: {searchParams.get("q")}</p> : null}

          {loading ? <p className="mt-3 text-sm text-on-surface-variant">Loading batches...</p> : null}

          {!loading && sharedBatches.length === 0 ? (
            <p className="mt-3 text-sm text-on-surface-variant">{batchQuery ? "No batches matched this search." : "Batches will appear here once you create a media batch."}</p>
          ) : null}

          {!loading && sharedBatches.length > 0 ? (
            <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(360px,420px))] justify-start gap-4">
              {sharedBatches.map((batch) => {
                if (!batch.share) {
                  return null;
                }

                const share = batch.share;
                const shareUrl = share.publicUrl ?? `${origin}${share.publicPath}`;
                const expiresAtLabel = formatDateDdMmYyyy(share.expiresAt);
                const countdown = formatCountdown(share.expiresAt, nowMs);
                const previewLimitLabel = share.allowDownload
                  ? "Unlimited"
                  : String(Math.max(1, share.previewViewLimit ?? 3));
                const isUpdating = updatingBatchIds.includes(batch.id);
                const focusedBySuggestion = batch.id === batchIdFromQuery;

                return (
                  <article
                    key={batch.id}
                    className={`min-h-[360px] rounded-lg border bg-surface-container p-3 ${
                      focusedBySuggestion ? "border-primary/35 shadow-[inset_0_0_0_1px_rgba(111,77,230,0.2)]" : "border-outline-variant/15"
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
                        <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Preview Limit</p>
                        <p className="mt-1 text-xs font-semibold text-on-surface">{previewLimitLabel}</p>
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

                    <div className="mt-4 w-full space-y-2">
                      <div className="grid w-full grid-cols-3 gap-2">
                        <button
                          type="button"
                          className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 text-[10px] font-bold uppercase tracking-widest text-on-surface transition-colors hover:text-primary"
                          onClick={() => {
                            void copyBatchUrl(batch.id, shareUrl);
                          }}
                        >
                          {copiedBatchId === batch.id ? "(Copied)" : "Copy URL"}
                        </button>

                        <a
                          href={shareUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-primary/30 bg-primary/10 px-3 text-[10px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary/20"
                        >
                          Open Batch
                        </a>

                        <button
                          type="button"
                          disabled={isUpdating}
                          className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-error/25 bg-error/10 px-3 text-[10px] font-bold uppercase tracking-widest text-error transition-colors hover:bg-error/15 disabled:cursor-not-allowed disabled:opacity-70"
                          onClick={() => {
                            void removeBatch(batch.id, formatBatchName(batch));
                          }}
                        >
                          Delete Batch
                        </button>
                      </div>

                      <div className="grid w-full grid-cols-2 gap-2">
                        <div
                          className={`inline-flex w-full items-center justify-between gap-2 rounded-lg border border-outline-variant/45 bg-surface-container-highest/75 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:border-outline-variant/35 dark:bg-surface-container-high dark:shadow-none ${
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
                            className={`relative inline-flex h-5 w-10 items-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-high disabled:cursor-not-allowed ${
                              share.allowDownload
                                ? "border-primary/80 bg-primary-container shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] dark:bg-primary"
                                : "border-outline/80 bg-[rgb(188_199_212_/_0.95)] shadow-[inset_0_1px_2px_rgba(17,28,40,0.22)] dark:border-outline-variant/80 dark:bg-surface-container-low"
                            }`}
                            onClick={() => {
                              void setBatchDownloadAccess(batch.id, !share.allowDownload, share.hideFilenames);
                            }}
                          >
                            <span
                              className={`absolute left-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-[rgb(95_109_126_/_0.75)] bg-white shadow-[0_1px_2px_rgba(16,26,38,0.3)] transition-transform dark:border-slate-200/40 dark:bg-slate-100 ${
                                share.allowDownload ? "translate-x-5" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>

                        <div
                          className={`inline-flex w-full items-center justify-between gap-2 rounded-lg border border-outline-variant/45 bg-surface-container-highest/75 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:border-outline-variant/35 dark:bg-surface-container-high dark:shadow-none ${
                            isUpdating ? "opacity-70" : ""
                          }`}
                        >
                          <span>Hide Filenames</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={share.hideFilenames}
                            aria-label="Hide filenames on shared page for this batch"
                            disabled={isUpdating}
                            className={`relative inline-flex h-5 w-10 items-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-high disabled:cursor-not-allowed ${
                              share.hideFilenames
                                ? "border-primary/80 bg-primary-container shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] dark:bg-primary"
                                : "border-outline/80 bg-[rgb(188_199_212_/_0.95)] shadow-[inset_0_1px_2px_rgba(17,28,40,0.22)] dark:border-outline-variant/80 dark:bg-surface-container-low"
                            }`}
                            onClick={() => {
                              void setBatchHideFilenames(batch.id, share.allowDownload, !share.hideFilenames);
                            }}
                          >
                            <span
                              className={`absolute left-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-[rgb(95_109_126_/_0.75)] bg-white shadow-[0_1px_2px_rgba(16,26,38,0.3)] transition-transform dark:border-slate-200/40 dark:bg-slate-100 ${
                                share.hideFilenames ? "translate-x-5" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>
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
