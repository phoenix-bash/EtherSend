"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Power, Download, Trash2, Link2, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  absoluteApiUrl,
  createBatch,
  createImageLink,
  createOrRefreshBatchShare,
  deleteMedia,
  listMedia,
  replaceMedia,
  toggleMedia,
  updateBatchShare,
  type MediaItem
} from "../../lib/api-client";
import { copyTextToClipboard } from "../../lib/clipboard";
import { MEDIA_LIBRARY_CHANGED_EVENT, MEDIA_UPLOADED_EVENT, SIGNED_OUT_EVENT, SYSTEM_LOG_EVENT, type SystemLogLevel } from "../../lib/events";
import { formatDateTimeDdMmYyyyHm } from "../../lib/utils";

interface MediaStateBadge {
  label: string;
  className: string;
}

interface GeneratedLinkQr {
  url: string;
  label: string;
  expiresAt?: string;
}

function getMediaState(item: MediaItem): MediaStateBadge {
  if (!item.isActive) {
    return { label: "Archived", className: "border-amber-500/40 bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200" };
  }

  if (item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now()) {
    return { label: "Expired", className: "border-rose-500/40 bg-rose-100 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200" };
  }

  return { label: "Active", className: "border-emerald-500/40 bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200" };
}

export function MediaManager() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [status, setStatus] = useState("");
  const [selectedReplaceId, setSelectedReplaceId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchName, setBatchName] = useState("");
  const [batchAllowDownload, setBatchAllowDownload] = useState(false);
  const [batchShareAll, setBatchShareAll] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [directLinks, setDirectLinks] = useState<Record<string, { url: string; expiresAt: string }>>({});
  const [generatedLinkQr, setGeneratedLinkQr] = useState<GeneratedLinkQr | null>(null);
  const [batchCopyState, setBatchCopyState] = useState<"idle" | "copied">("idle");
  const [actionFlashKey, setActionFlashKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchCopyTimerRef = useRef<number | null>(null);
  const actionFlashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (batchCopyTimerRef.current) {
        window.clearTimeout(batchCopyTimerRef.current);
      }

      if (actionFlashTimerRef.current) {
        window.clearTimeout(actionFlashTimerRef.current);
      }
    };
  }, []);

  function emitSystemLog(message: string, level: SystemLogLevel = "info"): void {
    window.dispatchEvent(new CustomEvent(SYSTEM_LOG_EVENT, { detail: { message, level } }));
  }

  function emitLibraryChange(): void {
    window.dispatchEvent(new Event(MEDIA_LIBRARY_CHANGED_EVENT));
  }

  function markBatchCopied(): void {
    setBatchCopyState("copied");
    if (batchCopyTimerRef.current) {
      window.clearTimeout(batchCopyTimerRef.current);
    }

    batchCopyTimerRef.current = window.setTimeout(() => {
      setBatchCopyState("idle");
    }, 1800);
  }

  function flashAction(actionKey: string): void {
    setActionFlashKey(actionKey);
    if (actionFlashTimerRef.current) {
      window.clearTimeout(actionFlashTimerRef.current);
    }

    actionFlashTimerRef.current = window.setTimeout(() => {
      setActionFlashKey((current) => (current === actionKey ? null : current));
    }, 240);
  }

  function actionButtonClass(actionKey: string, tone: "default" | "danger" = "default"): string {
    const flashed = actionFlashKey === actionKey;
    const shared = "shrink-0 rounded-md border p-1.5 transition-all duration-150";

    if (tone === "danger") {
      return `${shared} ${
        flashed
          ? "border-error/55 bg-error/20 text-error"
          : "border-outline-variant/35 bg-surface-container-high text-on-surface hover:border-error/45 hover:text-error"
      }`;
    }

    return `${shared} ${
      flashed
        ? "border-primary/45 bg-primary/20 text-primary"
        : "border-outline-variant/35 bg-surface-container-high text-on-surface hover:border-primary/45 hover:text-primary"
    }`;
  }

  async function refreshMedia(): Promise<void> {
    try {
      const response = await listMedia();
      setItems(response.items);
      setStatus("");
    } catch {
      setStatus("Failed to load media. Sign in first.");
      setItems([]);
    }
  }

  useEffect(() => {
    void refreshMedia();
  }, []);

  useEffect(() => {
    function onMediaUploaded(event: Event): void {
      const detail = (event as CustomEvent<{ media?: MediaItem }>).detail;
      const media = detail?.media;
      if (!media) {
        return;
      }

      setItems((current) => [media, ...current.filter((item) => item.id !== media.id)]);
      setStatus("");
    }

    function onSignedOut(): void {
      setItems([]);
      setSelectedIds([]);
      setBatchShareAll(false);
      setSelectedReplaceId(null);
      setBatchId(null);
      setDirectLinks({});
      setGeneratedLinkQr(null);
      setBatchCopyState("idle");
      setStatus("");
    }

    window.addEventListener(MEDIA_UPLOADED_EVENT, onMediaUploaded);
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);

    return () => {
      window.removeEventListener(MEDIA_UPLOADED_EVENT, onMediaUploaded);
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
    };
  }, []);

  async function toggleActive(item: MediaItem): Promise<void> {
    try {
      await toggleMedia(item.id, { isActive: !item.isActive });
      await refreshMedia();
      emitLibraryChange();
      emitSystemLog(item.isActive ? `Media archived: ${item.filename}.` : `Media re-activated: ${item.filename}.`, item.isActive ? "warning" : "success");
    } catch {
      setStatus(`Failed to update status for ${item.filename}.`);
    }
  }

  async function toggleDownload(item: MediaItem): Promise<void> {
    try {
      await toggleMedia(item.id, { allowDownload: !item.allowDownload });
      await refreshMedia();
      emitLibraryChange();
      emitSystemLog(
        item.allowDownload ? `Download disabled for ${item.filename}.` : `Download enabled for ${item.filename}.`,
        item.allowDownload ? "warning" : "success"
      );
    } catch {
      setStatus(`Failed to update download policy for ${item.filename}.`);
    }
  }

  async function removeItem(item: MediaItem): Promise<void> {
    try {
      await deleteMedia(item.id);
      setSelectedIds((prev) => prev.filter((id) => id !== item.id));
      await refreshMedia();
      emitLibraryChange();
      emitSystemLog(`Media deleted: ${item.filename}.`, "warning");
    } catch {
      setStatus(`Failed to delete ${item.filename}.`);
    }
  }

  async function onReplacePicked(file: File | null): Promise<void> {
    if (!file || !selectedReplaceId) {
      return;
    }

    try {
      await replaceMedia(selectedReplaceId, file);
      setSelectedReplaceId(null);
      await refreshMedia();
      emitLibraryChange();
      emitSystemLog("Media replaced successfully.", "success");
    } catch {
      setStatus("Failed to replace media.");
    }
  }

  function asMegabytes(sizeBytes: string): string {
    const bytes = Number(sizeBytes);
    if (Number.isNaN(bytes)) {
      return "-";
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  async function generateOrCopyDirectLink(item: MediaItem): Promise<void> {
    try {
      const existing = directLinks[item.id];
      if (existing) {
        const copied = await copyTextToClipboard(existing.url);
        if (copied) {
          setStatus("");
          emitSystemLog(`Direct link copied for ${item.filename}.`);
        } else {
          setStatus(`Direct link ready for ${item.filename}, but copy failed on this device.`);
        }
        return;
      }

      const created = await createImageLink(item.id);
      const url = absoluteApiUrl(created.directUrl);
      setDirectLinks((prev) => ({
        ...prev,
        [item.id]: {
          url,
          expiresAt: created.link.expiresAt
        }
      }));
      setGeneratedLinkQr({
        url,
        label: `Direct link for ${item.filename}`,
        expiresAt: created.link.expiresAt
      });
      const copied = await copyTextToClipboard(url);
      if (copied) {
        setStatus("");
        emitSystemLog(`Direct link generated for ${item.filename}.`, "success");
      } else {
        setStatus(`Direct link generated for ${item.filename}, but copying failed on this device.`);
      }
    } catch {
      setStatus(`Failed to generate direct link for ${item.filename}.`);
    }
  }

  function toggleSelected(itemId: string, checked: boolean): void {
    setSelectedIds((prev) => {
      if (checked) {
        if (prev.includes(itemId)) {
          return prev;
        }
        return [...prev, itemId];
      }

      return prev.filter((id) => id !== itemId);
    });
  }

  async function createBatchShare(): Promise<void> {
    const targetMediaIds = batchShareAll ? items.map((item) => item.id) : selectedIds;

    if (targetMediaIds.length === 0) {
      setStatus(batchShareAll ? "No media available to share." : "Select at least one media file to create a batch share.");
      return;
    }

    try {
      const batchResult = await createBatch(targetMediaIds, batchName || undefined);
      const shareResult = await createOrRefreshBatchShare(batchResult.batch.id, batchAllowDownload);
      const publicUrl = shareResult.share.publicUrl ?? `${window.location.origin}${shareResult.share.publicPath}`;

      setBatchId(batchResult.batch.id);
      setGeneratedLinkQr({
        url: publicUrl,
        label: `Batch share for ${batchResult.batch.name || "Untitled batch"}`,
        expiresAt: shareResult.share.expiresAt
      });

      const copied = await copyTextToClipboard(publicUrl);
      if (copied) {
        markBatchCopied();
        setStatus("");
      } else {
        setStatus("Batch share created. Copy failed on this device.");
      }

      emitLibraryChange();
      emitSystemLog(`Batch share generated for ${batchResult.batch.name}.`, "success");
    } catch {
      setStatus("Failed to create batch share link.");
    }
  }

  async function updateDownloadSetting(nextAllowDownload: boolean): Promise<void> {
    setBatchAllowDownload(nextAllowDownload);

    if (!batchId) {
      return;
    }

    try {
      const updated = await updateBatchShare(batchId, nextAllowDownload);
      setGeneratedLinkQr((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          expiresAt: updated.share.expiresAt
        };
      });
      setStatus("");
      emitLibraryChange();
      emitSystemLog(nextAllowDownload ? "Batch download access enabled." : "Batch download access disabled.");
    } catch {
      setStatus("Failed to update batch download setting.");
    }
  }

  async function copyBatchShare(): Promise<void> {
    if (!generatedLinkQr) {
      return;
    }

    const copied = await copyTextToClipboard(generatedLinkQr.url);
    if (copied) {
      markBatchCopied();
      setStatus("");
      emitSystemLog("Batch share link copied.");
      return;
    }

    setStatus("Failed to copy batch share link.");
  }

  const activeItems = items.filter((item) => item.isActive).length;
  const downloadableItems = items.filter((item) => item.allowDownload).length;
  const batchShareTargetCount = batchShareAll ? items.length : selectedIds.length;
  const copyButtonLabel = generatedLinkQr?.label.toLowerCase().includes("batch share") ? "Copy share link" : "Copy link";

  return (
    <section className="relative overflow-hidden rounded-2xl border border-outline-variant/20 bg-surface-container-low/80 p-5 shadow-lift backdrop-blur-xl before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-24 before:bg-gradient-to-b before:from-white/35 before:to-transparent dark:before:from-white/10 sm:p-6 md:bg-[linear-gradient(148deg,rgba(255,255,255,0.34),rgba(255,255,255,0.1))] md:shadow-[inset_0_1px_0_rgba(255,255,255,0.52),0_18px_38px_rgba(17,28,48,0.16)] dark:md:bg-[linear-gradient(150deg,rgba(172,198,228,0.1),rgba(172,198,228,0.03))] dark:md:shadow-[inset_0_1px_0_rgba(172,198,228,0.16),0_20px_44px_rgba(0,0,0,0.42)]">
      <div className="pointer-events-none absolute -right-20 -top-16 hidden h-48 w-48 rounded-full bg-primary/18 blur-3xl md:block" />
      <div className="pointer-events-none absolute -left-16 bottom-6 hidden h-36 w-36 rounded-full bg-primary-container/20 blur-3xl md:block dark:bg-primary/18" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h2 className="font-headline text-xl font-bold text-on-surface">Media Archive Console</h2>
          <p className="text-xs text-on-surface-variant">Control status, download policies, direct links, and secure batches from one queue.</p>
        </div>
      </div>

      <div
        id="batch-share-panel"
        className="mb-4 rounded-2xl border border-outline-variant/20 bg-surface-container/80 p-3 backdrop-blur-lg md:bg-[linear-gradient(155deg,rgba(255,255,255,0.3),rgba(255,255,255,0.1))] dark:md:bg-[linear-gradient(155deg,rgba(172,198,228,0.08),rgba(172,198,228,0.02))]"
      >
        <p className="text-sm font-bold uppercase tracking-wider text-on-surface">Batch Share</p>
        <p className="mt-1 text-xs text-on-surface-variant">Create one public share page for selected files. Recipients can view files without signing in.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-center">
          <input
            value={batchName}
            onChange={(event) => {
              setBatchName(event.target.value);
            }}
            placeholder="Batch name (optional)"
            className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-2.5 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0 sm:col-span-2 lg:col-span-1"
          />
          <div className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/45 bg-surface-container-highest/75 px-2.5 py-1.5 text-[11px] uppercase tracking-wider text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:border-outline-variant/35 dark:bg-surface-container-high dark:shadow-none">
            <span className="font-label">Allow downloads</span>
            <button
              type="button"
              role="switch"
              aria-checked={batchAllowDownload}
              aria-label="Allow downloads for this batch share"
              className={`relative inline-flex h-5 w-10 items-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-high ${
                batchAllowDownload
                  ? "border-primary/80 bg-primary-container shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] dark:bg-primary"
                  : "border-outline/80 bg-[rgb(188_199_212_/_0.95)] shadow-[inset_0_1px_2px_rgba(17,28,40,0.22)] dark:border-outline-variant/80 dark:bg-surface-container-low"
              }`}
              onClick={() => {
                void updateDownloadSetting(!batchAllowDownload);
              }}
            >
              <span
                className={`absolute left-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-[rgb(95_109_126_/_0.75)] bg-white shadow-[0_1px_2px_rgba(16,26,38,0.3)] transition-transform dark:border-slate-200/40 dark:bg-slate-100 ${
                  batchAllowDownload ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/45 bg-surface-container-highest/75 px-2.5 py-1.5 text-[11px] uppercase tracking-wider text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:border-outline-variant/35 dark:bg-surface-container-high dark:shadow-none">
            <span className="font-label">Share all</span>
            <button
              type="button"
              role="switch"
              aria-checked={batchShareAll}
              aria-label="Share all media in this batch"
              className={`relative inline-flex h-5 w-10 items-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-high ${
                batchShareAll
                  ? "border-primary/80 bg-primary-container shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] dark:bg-primary"
                  : "border-outline/80 bg-[rgb(188_199_212_/_0.95)] shadow-[inset_0_1px_2px_rgba(17,28,40,0.22)] dark:border-outline-variant/80 dark:bg-surface-container-low"
              }`}
              onClick={() => {
                setBatchShareAll((current) => !current);
              }}
            >
              <span
                className={`absolute left-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-[rgb(95_109_126_/_0.75)] bg-white shadow-[0_1px_2px_rgba(16,26,38,0.3)] transition-transform dark:border-slate-200/40 dark:bg-slate-100 ${
                  batchShareAll ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <button
            className="rounded-lg bg-gradient-to-r from-primary to-primary-container px-2.5 py-1.5 text-[11px] font-label font-bold uppercase tracking-wider text-on-primary-container transition-all hover:scale-[1.01]"
            onClick={() => {
              void createBatchShare();
            }}
          >
            Create link ({batchShareTargetCount})
          </button>
        </div>

        {generatedLinkQr ? (
          <div className="mt-3 rounded-lg border border-outline-variant/20 bg-surface-container-high p-3">
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant">Share QR</p>
              <div className="rounded-lg bg-white p-2">
                <QRCodeSVG value={generatedLinkQr.url} size={120} includeMargin />
              </div>
              <p className="text-xs text-on-surface">{generatedLinkQr.label}</p>
              {generatedLinkQr.expiresAt ? (
                <p className="text-[10px] uppercase tracking-wider text-primary">Expires: {formatDateTimeDdMmYyyyHm(generatedLinkQr.expiresAt)}</p>
              ) : null}
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-container px-3 py-2 text-[10px] font-label uppercase tracking-wider text-on-surface transition-all hover:text-primary"
                onClick={() => {
                  void copyBatchShare();
                }}
              >
                <Copy className="h-4 w-4" />
                {batchCopyState === "copied" ? "(Copied)" : copyButtonLabel}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void onReplacePicked(file);
        }}
      />

      <div className="relative overflow-hidden rounded-[1.4rem] border border-outline-variant/15 bg-surface-container-lowest/45 px-1 py-1 backdrop-blur-xl sm:px-1.5 sm:py-1.5 md:bg-[linear-gradient(165deg,rgba(255,255,255,0.3),rgba(255,255,255,0.06))] dark:md:bg-[linear-gradient(165deg,rgba(172,198,228,0.08),rgba(172,198,228,0.01))]">
        <div className="divide-y divide-outline-variant/10 md:hidden">
          {items.length > 0 ? (
            items.map((item) => {
              const state = getMediaState(item);
              const isSelected = selectedIds.includes(item.id);
              return (
                <article key={item.id} className="p-2.5">
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      className={`mt-0.5 grid h-5 w-5 place-items-center rounded-full border transition-all ${
                        isSelected
                          ? "border-primary/90 bg-primary/30 text-primary"
                          : "border-outline-variant/70 bg-surface-container-low text-on-surface-variant"
                      }`}
                      aria-label={isSelected ? "Unselect media" : "Select media"}
                      aria-pressed={isSelected}
                      onClick={() => {
                        toggleSelected(item.id, !isSelected);
                      }}
                    >
                      <span className={`material-symbols-outlined text-[13px] transition-opacity ${isSelected ? "opacity-100" : "opacity-0"}`}>done</span>
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-on-surface" title={item.filename}>{item.filename}</p>

                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="truncate text-[10px] text-on-surface-variant" title={`${item.mimeType} • ${asMegabytes(item.sizeBytes)}`}>{item.mimeType} • {asMegabytes(item.sizeBytes)}</span>
                        <span className="truncate text-[10px] text-on-surface-variant">Exp: {item.expiresAt ? formatDateTimeDdMmYyyyHm(item.expiresAt) : "-"}</span>
                      </div>

                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-label uppercase tracking-wider ${state.className}`}>{state.label}</span>
                        <div className="flex flex-nowrap justify-end gap-1">
                          {item.mimeType.startsWith("image/") ? (
                            <button
                              className={actionButtonClass(`${item.id}:direct-link`)}
                              aria-label={directLinks[item.id] ? "copy direct link" : "generate direct link"}
                              onClick={() => {
                                flashAction(`${item.id}:direct-link`);
                                void generateOrCopyDirectLink(item);
                              }}
                              title={directLinks[item.id] ? "Copy direct link" : "Generate direct link"}
                            >
                              {directLinks[item.id] ? <Copy className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                            </button>
                          ) : null}
                          <button
                            className={actionButtonClass(`${item.id}:replace`)}
                            aria-label="replace media"
                            onClick={() => {
                              flashAction(`${item.id}:replace`);
                              setSelectedReplaceId(item.id);
                              fileInputRef.current?.click();
                            }}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className={actionButtonClass(`${item.id}:toggle-active`)}
                            aria-label="toggle active"
                            onClick={() => {
                              flashAction(`${item.id}:toggle-active`);
                              void toggleActive(item);
                            }}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className={actionButtonClass(`${item.id}:toggle-download`)}
                            aria-label="toggle download"
                            onClick={() => {
                              flashAction(`${item.id}:toggle-download`);
                              void toggleDownload(item);
                            }}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className={actionButtonClass(`${item.id}:delete`, "danger")}
                            aria-label="delete media"
                            onClick={() => {
                              flashAction(`${item.id}:delete`);
                              void removeItem(item);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <p className="px-2 py-8 text-center text-sm text-on-surface-variant">No media indexed yet.</p>
          )}
        </div>

        <div className="hidden overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container-low/35 md:block">
          <table className="w-full table-fixed text-left text-xs">
            <colgroup>
              <col className="w-10 sm:w-12" />
              <col />
              <col className="w-[5.5rem]" />
              <col className="w-[7.25rem]" />
              <col className="w-[11rem]" />
            </colgroup>
            <thead className="bg-white/24 backdrop-blur-md dark:bg-slate-900/24">
              <tr>
                <th className="pl-2 pr-4 py-3 text-center text-[10px] font-label uppercase tracking-[0.15em] text-on-surface-variant">
                  <span className="sm:hidden">Sel</span>
                  <span className="hidden sm:inline">Select</span>
                </th>
                <th className="pl-4 pr-2 py-3 text-[10px] font-label uppercase tracking-[0.15em] text-on-surface-variant">Asset</th>
                <th className="px-2 py-3 text-left text-[10px] font-label uppercase tracking-[0.15em] text-on-surface-variant">State</th>
                <th className="px-2 py-3 text-left text-[10px] font-label uppercase tracking-[0.15em] text-on-surface-variant">Expiry</th>
                <th className="px-2 py-3 text-right text-[10px] font-label uppercase tracking-[0.15em] text-on-surface-variant">
                  <span className="sm:hidden">Act</span>
                  <span className="hidden sm:inline">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {items.length > 0 ? (
                items.map((item) => {
                  const state = getMediaState(item);
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <tr key={item.id} className="group transition-colors hover:bg-surface-container-high/40 md:hover:bg-white/18 dark:md:hover:bg-slate-800/28">
                      <td className="pl-2 pr-4 py-2 align-top text-center">
                        <button
                          type="button"
                          className={`inline-grid h-5 w-5 place-items-center rounded-full border transition-all ${
                            isSelected
                              ? "border-primary/90 bg-primary/30 text-primary"
                              : "border-outline-variant/70 bg-surface-container-low text-on-surface-variant"
                          }`}
                          aria-label={isSelected ? "Unselect media" : "Select media"}
                          aria-pressed={isSelected}
                          onClick={() => {
                            toggleSelected(item.id, !isSelected);
                          }}
                        >
                          <span className={`material-symbols-outlined text-[13px] transition-opacity ${isSelected ? "opacity-100" : "opacity-0"}`}>done</span>
                        </button>
                      </td>
                      <td className="pl-4 pr-2 py-2 align-top">
                        <p className="max-w-full truncate font-semibold text-on-surface" title={item.filename}>{item.filename}</p>
                        <p className="truncate text-[10px] text-on-surface-variant" title={`${item.mimeType} • ${asMegabytes(item.sizeBytes)}`}>{item.mimeType} • {asMegabytes(item.sizeBytes)}</p>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-label uppercase tracking-wider ${state.className}`}>{state.label}</span>
                      </td>
                      <td className="truncate px-2 py-2 align-top text-xs text-on-surface-variant">{item.expiresAt ? formatDateTimeDdMmYyyyHm(item.expiresAt) : "-"}</td>
                      <td className="px-2 py-2 align-top whitespace-nowrap">
                        <div className="flex flex-nowrap justify-end gap-1">
                          {item.mimeType.startsWith("image/") ? (
                            <button
                              className={actionButtonClass(`${item.id}:direct-link`)}
                              aria-label={directLinks[item.id] ? "copy direct link" : "generate direct link"}
                              onClick={() => {
                                flashAction(`${item.id}:direct-link`);
                                void generateOrCopyDirectLink(item);
                              }}
                              title={directLinks[item.id] ? "Copy direct link" : "Generate direct link"}
                            >
                              {directLinks[item.id] ? <Copy className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
                            </button>
                          ) : null}
                          <button
                            className={actionButtonClass(`${item.id}:replace`)}
                            aria-label="replace media"
                            onClick={() => {
                              flashAction(`${item.id}:replace`);
                              setSelectedReplaceId(item.id);
                              fileInputRef.current?.click();
                            }}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className={actionButtonClass(`${item.id}:toggle-active`)}
                            aria-label="toggle active"
                            onClick={() => {
                              flashAction(`${item.id}:toggle-active`);
                              void toggleActive(item);
                            }}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className={actionButtonClass(`${item.id}:toggle-download`)}
                            aria-label="toggle download"
                            onClick={() => {
                              flashAction(`${item.id}:toggle-download`);
                              void toggleDownload(item);
                            }}
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className={actionButtonClass(`${item.id}:delete`, "danger")}
                            aria-label="delete media"
                            onClick={() => {
                              flashAction(`${item.id}:delete`);
                              void removeItem(item);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-2 py-8 text-center text-sm text-on-surface-variant">
                    No media indexed yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-1.5">
        <div className="surface-soft rounded-md border border-outline-variant/15 bg-surface-container p-2">
          <div className="flex items-center justify-between gap-1">
            <p className="truncate text-[9px] font-label uppercase tracking-wider text-on-surface-variant">Indexed</p>
            <p className="font-headline text-sm font-bold text-on-surface">{items.length}</p>
          </div>
        </div>
        <div className="surface-soft rounded-md border border-outline-variant/15 bg-surface-container p-2">
          <div className="flex items-center justify-between gap-1">
            <p className="truncate text-[9px] font-label uppercase tracking-wider text-on-surface-variant">Active</p>
            <p className="font-headline text-sm font-bold text-on-surface">{activeItems}</p>
          </div>
        </div>
        <div className="surface-soft rounded-md border border-outline-variant/15 bg-surface-container p-2">
          <div className="flex items-center justify-between gap-1">
            <p className="truncate text-[9px] font-label uppercase tracking-wider text-on-surface-variant">Download</p>
            <p className="font-headline text-sm font-bold text-on-surface">{downloadableItems}</p>
          </div>
        </div>
      </div>

      {status ? <p className="mt-3 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{status}</p> : null}
    </section>
  );
}
