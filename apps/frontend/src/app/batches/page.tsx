"use client";

import { useEffect, useMemo, useState } from "react";
import { ControlShell } from "../../components/control-shell";
import { listBatches, type BatchListItem } from "../../lib/api-client";
import { MEDIA_LIBRARY_CHANGED_EVENT, MEDIA_UPLOADED_EVENT, SIGNED_OUT_EVENT } from "../../lib/events";

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
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading batches...");
  const [origin, setOrigin] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  async function refreshBatches(): Promise<void> {
    setLoading(true);
    try {
      const { items } = await listBatches();
      setBatches(items);
      setStatus(items.length > 0 ? "Batches loaded." : "Batches will appear here once you create a media batch.");
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
      setStatus("Batches will appear here once you create a media batch.");
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
    return batches.filter((batch) => batch.share);
  }, [batches]);

  async function copyBatchUrl(url: string): Promise<void> {
    await navigator.clipboard.writeText(url);
    setStatus("Batch URL copied.");
  }

  return (
    <ControlShell searchPlaceholder="Search batch names...">
      <div className="flex flex-col gap-6">
        <section>
          <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface md:text-4xl">Batches</h2>
          <p className="mt-1 text-sm text-on-surface-variant">Only your created media batches are shown here.</p>
        </section>

        <section className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-5">
          <p className="text-xs text-on-surface-variant">{status}</p>

          {loading ? <p className="mt-3 text-sm text-on-surface-variant">Loading batches...</p> : null}

          {!loading && sharedBatches.length === 0 ? (
            <p className="mt-3 text-sm text-on-surface-variant">Batches will appear here once you create a media batch.</p>
          ) : null}

          {!loading && sharedBatches.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              {sharedBatches.map((batch) => {
                if (!batch.share) {
                  return null;
                }

                const shareUrl = `${origin}${batch.share.publicPath}`;
                const expiresAtLabel = new Date(batch.share.expiresAt).toLocaleString();
                const countdown = formatCountdown(batch.share.expiresAt, nowMs);

                return (
                  <article key={batch.id} className="rounded-lg border border-outline-variant/15 bg-surface-container p-4">
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

                      <a
                        href={shareUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={`rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                          batch.share.allowDownload
                            ? "border border-tertiary/30 bg-tertiary/10 text-tertiary hover:bg-tertiary/20"
                            : "pointer-events-none border border-outline-variant/20 bg-surface-container-high text-on-surface-variant"
                        }`}
                      >
                        {batch.share.allowDownload ? "Download Access" : "Download Disabled"}
                      </a>
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
