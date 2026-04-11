"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Power, Download, Trash2, Link2, Copy } from "lucide-react";
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
import { MEDIA_LIBRARY_CHANGED_EVENT, MEDIA_UPLOADED_EVENT, SIGNED_OUT_EVENT, SYSTEM_LOG_EVENT, type SystemLogLevel } from "../../lib/events";

interface MediaStateBadge {
  label: string;
  className: string;
}

function getMediaState(item: MediaItem): MediaStateBadge {
  if (!item.isActive) {
    return { label: "Archived", className: "border-amber-500/40 bg-amber-500/10 text-amber-200" };
  }

  if (item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now()) {
    return { label: "Expired", className: "border-rose-500/40 bg-rose-500/10 text-rose-200" };
  }

  return { label: "Active", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" };
}

function shortenIdentifier(identifier: string): string {
  return identifier.slice(0, 8);
}

export function MediaManager() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [status, setStatus] = useState("Loading media...");
  const [selectedReplaceId, setSelectedReplaceId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchName, setBatchName] = useState("");
  const [batchAllowDownload, setBatchAllowDownload] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchShareUrl, setBatchShareUrl] = useState<string | null>(null);
  const [batchShareExpiresAt, setBatchShareExpiresAt] = useState<string | null>(null);
  const [directLinks, setDirectLinks] = useState<Record<string, { url: string; expiresAt: string }>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function emitSystemLog(message: string, level: SystemLogLevel = "info"): void {
    window.dispatchEvent(new CustomEvent(SYSTEM_LOG_EVENT, { detail: { message, level } }));
  }

  function emitLibraryChange(): void {
    window.dispatchEvent(new Event(MEDIA_LIBRARY_CHANGED_EVENT));
  }

  async function refreshMedia(): Promise<void> {
    try {
      const response = await listMedia();
      setItems(response.items);
      setStatus("Media loaded.");
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
      setStatus("Media updated from upload.");
    }

    function onSignedOut(): void {
      setItems([]);
      setSelectedIds([]);
      setSelectedReplaceId(null);
      setBatchId(null);
      setBatchShareUrl(null);
      setBatchShareExpiresAt(null);
      setDirectLinks({});
      setStatus("Signed out. HOME cleared.");
    }

    window.addEventListener(MEDIA_UPLOADED_EVENT, onMediaUploaded);
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);

    return () => {
      window.removeEventListener(MEDIA_UPLOADED_EVENT, onMediaUploaded);
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
    };
  }, []);

  async function toggleActive(item: MediaItem): Promise<void> {
    await toggleMedia(item.id, { isActive: !item.isActive });
    await refreshMedia();
    emitLibraryChange();
    emitSystemLog(item.isActive ? `Media archived: ${item.filename}.` : `Media re-activated: ${item.filename}.`, item.isActive ? "warning" : "success");
  }

  async function toggleDownload(item: MediaItem): Promise<void> {
    await toggleMedia(item.id, { allowDownload: !item.allowDownload });
    await refreshMedia();
    emitLibraryChange();
    emitSystemLog(
      item.allowDownload ? `Download disabled for ${item.filename}.` : `Download enabled for ${item.filename}.`,
      item.allowDownload ? "warning" : "success"
    );
  }

  async function removeItem(item: MediaItem): Promise<void> {
    await deleteMedia(item.id);
    setSelectedIds((prev) => prev.filter((id) => id !== item.id));
    await refreshMedia();
    emitLibraryChange();
    emitSystemLog(`Media deleted: ${item.filename}.`, "warning");
  }

  async function onReplacePicked(file: File | null): Promise<void> {
    if (!file || !selectedReplaceId) {
      return;
    }

    await replaceMedia(selectedReplaceId, file);
    setSelectedReplaceId(null);
    await refreshMedia();
    emitLibraryChange();
    emitSystemLog(`Media replaced successfully.`, "success");
  }

  function asMegabytes(sizeBytes: string): string {
    const bytes = Number(sizeBytes);
    if (Number.isNaN(bytes)) {
      return "-";
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  async function generateOrCopyDirectLink(item: MediaItem): Promise<void> {
    const existing = directLinks[item.id];
    if (existing) {
      await navigator.clipboard.writeText(existing.url);
      setStatus("Direct link copied.");
      emitSystemLog(`Direct link copied for ${item.filename}.`);
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
    await navigator.clipboard.writeText(url);
    setStatus("Direct link generated and copied.");
    emitSystemLog(`Direct link generated for ${item.filename}.`, "success");
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
    if (selectedIds.length === 0) {
      setStatus("Select at least one media file to create a batch share.");
      return;
    }

    const batchResult = await createBatch(selectedIds, batchName || undefined);
    const shareResult = await createOrRefreshBatchShare(batchResult.batch.id, batchAllowDownload);
    const publicUrl = `${window.location.origin}${shareResult.share.publicPath}`;

    setBatchId(batchResult.batch.id);
    setBatchShareUrl(publicUrl);
    setBatchShareExpiresAt(shareResult.share.expiresAt);
    setStatus("Batch share link created.");
    emitLibraryChange();
    emitSystemLog(`Batch share generated for ${batchResult.batch.name}.`, "success");
  }

  async function updateDownloadSetting(nextAllowDownload: boolean): Promise<void> {
    setBatchAllowDownload(nextAllowDownload);

    if (!batchId) {
      return;
    }

    const updated = await updateBatchShare(batchId, nextAllowDownload);
    setBatchShareExpiresAt(updated.share.expiresAt);
    setStatus(nextAllowDownload ? "Batch download enabled." : "Batch download disabled.");
    emitLibraryChange();
    emitSystemLog(nextAllowDownload ? "Batch download access enabled." : "Batch download access disabled.");
  }

  async function copyBatchShare(): Promise<void> {
    if (!batchShareUrl) {
      return;
    }

    await navigator.clipboard.writeText(batchShareUrl);
    setStatus("Batch share link copied.");
    emitSystemLog("Batch share link copied.");
  }

  const activeItems = items.filter((item) => item.isActive).length;
  const downloadableItems = items.filter((item) => item.allowDownload).length;

  return (
    <section className="rounded-xl border border-outline-variant/15 bg-surface-container-low p-6 shadow-lift">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-headline text-xl font-bold text-on-surface">Media Archive Console</h2>
          <p className="text-xs text-on-surface-variant">Control status, download policies, direct links, and secure batches from one queue.</p>
        </div>
        <div className="flex gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 py-2 text-xs font-label uppercase tracking-wider text-on-surface transition-all hover:text-primary"
            onClick={() => {
              void refreshMedia();
            }}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-5 grid gap-2 md:grid-cols-3">
        <div className="rounded-lg border border-outline-variant/15 bg-surface-container p-3">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Indexed Files</p>
          <p className="mt-1 font-headline text-2xl font-bold text-on-surface">{items.length}</p>
        </div>
        <div className="rounded-lg border border-outline-variant/15 bg-surface-container p-3">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Active Records</p>
          <p className="mt-1 font-headline text-2xl font-bold text-on-surface">{activeItems}</p>
        </div>
        <div className="rounded-lg border border-outline-variant/15 bg-surface-container p-3">
          <p className="text-[10px] font-label uppercase tracking-widest text-on-surface-variant">Download Enabled</p>
          <p className="mt-1 font-headline text-2xl font-bold text-on-surface">{downloadableItems}</p>
        </div>
      </div>

      <div id="batch-share-panel" className="mb-6 rounded-xl border border-outline-variant/15 bg-surface-container p-4">
        <p className="text-sm font-bold uppercase tracking-wider text-on-surface">Batch Share</p>
        <p className="mt-1 text-xs text-on-surface-variant">Create one public share page for selected files. Recipients can view files without signing in.</p>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto] md:items-center">
          <input
            value={batchName}
            onChange={(event) => {
              setBatchName(event.target.value);
            }}
            placeholder="Batch name (optional)"
            className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0"
          />
          <label className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 py-2 text-xs font-label uppercase tracking-wider text-on-surface">
            <input
              type="checkbox"
              checked={batchAllowDownload}
              onChange={(event) => {
                void updateDownloadSetting(event.target.checked);
              }}
            />
            Allow downloads
          </label>
          <button
            className="rounded-lg bg-gradient-to-r from-primary to-primary-container px-3 py-2 text-xs font-label font-bold uppercase tracking-widest text-on-primary-container transition-all hover:scale-[1.01]"
            onClick={() => {
              void createBatchShare();
            }}
          >
            Create share link ({selectedIds.length})
          </button>
        </div>

        {batchShareUrl ? (
          <div className="mt-3 rounded-lg border border-outline-variant/20 bg-surface-container-high p-3">
            <div className="space-y-2">
              <p className="break-all text-xs text-on-surface">{batchShareUrl}</p>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-container px-3 py-2 text-[10px] font-label uppercase tracking-wider text-on-surface transition-all hover:text-primary"
                onClick={() => {
                  void copyBatchShare();
                }}
              >
                <Copy className="h-4 w-4" />
                Copy share link
              </button>
              {batchShareExpiresAt ? <p className="text-[10px] uppercase tracking-wider text-primary">Expires: {new Date(batchShareExpiresAt).toLocaleString()}</p> : null}
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

      <div className="overflow-x-auto rounded-2xl border border-outline-variant/10 bg-surface-container-lowest/30">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-4 text-[10px] font-label uppercase tracking-[0.2em] text-on-surface-variant">Select</th>
              <th className="px-4 py-4 text-[10px] font-label uppercase tracking-[0.2em] text-on-surface-variant">Asset</th>
              <th className="px-4 py-4 text-[10px] font-label uppercase tracking-[0.2em] text-on-surface-variant">Type</th>
              <th className="px-4 py-4 text-[10px] font-label uppercase tracking-[0.2em] text-on-surface-variant">Size</th>
              <th className="px-4 py-4 text-[10px] font-label uppercase tracking-[0.2em] text-on-surface-variant">Status</th>
              <th className="px-4 py-4 text-[10px] font-label uppercase tracking-[0.2em] text-on-surface-variant">Expires</th>
              <th className="px-4 py-4 text-[10px] font-label uppercase tracking-[0.2em] text-on-surface-variant">Updated</th>
              <th className="px-4 py-4 text-[10px] font-label uppercase tracking-[0.2em] text-on-surface-variant">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {items.length > 0 ? (
              items.map((item) => {
                const state = getMediaState(item);
                return (
                  <tr key={item.id} className="group transition-colors hover:bg-surface-container-high/40">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={(event) => {
                          toggleSelected(item.id, event.target.checked);
                        }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-on-surface">{item.filename}</p>
                      <p className="text-[10px] font-mono text-on-surface-variant">ID {shortenIdentifier(item.id)}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant">{item.mimeType}</td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant">{asMegabytes(item.sizeBytes)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-label uppercase tracking-wider ${state.className}`}>{state.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant">{item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : "-"}</td>
                    <td className="px-4 py-3 text-xs text-on-surface-variant">{new Date(item.updatedAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {item.mimeType.startsWith("image/") ? (
                          <button
                            className="rounded-lg border border-outline-variant/20 bg-surface-container p-2 text-on-surface-variant transition-all hover:text-primary"
                            aria-label={directLinks[item.id] ? "copy direct link" : "generate direct link"}
                            onClick={() => {
                              void generateOrCopyDirectLink(item);
                            }}
                            title={directLinks[item.id] ? "Copy direct link" : "Generate direct link"}
                          >
                            {directLinks[item.id] ? <Copy className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                          </button>
                        ) : null}
                        <button
                          className="rounded-lg border border-outline-variant/20 bg-surface-container p-2 text-on-surface-variant transition-all hover:text-primary"
                          aria-label="replace media"
                          onClick={() => {
                            setSelectedReplaceId(item.id);
                            fileInputRef.current?.click();
                          }}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded-lg border border-outline-variant/20 bg-surface-container p-2 text-on-surface-variant transition-all hover:text-primary"
                          aria-label="toggle active"
                          onClick={() => {
                            void toggleActive(item);
                          }}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded-lg border border-outline-variant/20 bg-surface-container p-2 text-on-surface-variant transition-all hover:text-primary"
                          aria-label="toggle download"
                          onClick={() => {
                            void toggleDownload(item);
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </button>
                        <button
                          className="rounded-lg border border-outline-variant/20 bg-surface-container p-2 text-on-surface-variant transition-all hover:text-error"
                          aria-label="delete media"
                          onClick={() => {
                            void removeItem(item);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-on-surface-variant">
                  No indexed media yet. Upload files to populate the library.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{status}</p>
    </section>
  );
}
