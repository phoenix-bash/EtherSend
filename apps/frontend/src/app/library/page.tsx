"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ControlShell } from "../../components/control-shell";
import {
  absoluteApiUrl,
  createImageLink,
  deleteMedia,
  getAccessToken,
  listMedia,
  mediaDownloadUrl,
  mediaViewUrl,
  replaceMedia,
  toggleMedia,
  type MediaItem
} from "../../lib/api-client";
import { MEDIA_LIBRARY_CHANGED_EVENT, MEDIA_UPLOADED_EVENT, SIGNED_OUT_EVENT } from "../../lib/events";
import { formatDateTimeDdMmYyyyHm } from "../../lib/utils";

type MediaFilter = "all" | "image" | "video" | "json" | "other";
type ViewMode = "grid" | "list";

function classifyMedia(item: MediaItem): Exclude<MediaFilter, "all"> {
  if (item.mimeType.startsWith("image/")) {
    return "image";
  }

  if (item.mimeType.startsWith("video/")) {
    return "video";
  }

  if (item.mimeType.includes("json")) {
    return "json";
  }

  return "other";
}

function formatBytes(sizeBytes: string): string {
  const value = Number(sizeBytes || "0");
  if (Number.isNaN(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const normalized = value / 1024 ** unitIndex;
  return `${normalized.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function formatPropertyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "string") {
    const isoLikeDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
    if (isoLikeDate) {
      const formatted = formatDateTimeDdMmYyyyHm(value);
      return formatted === "-" ? value : formatted;
    }

    return value;
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function mediaLabel(item: MediaItem): string {
  const type = classifyMedia(item);
  if (type === "image") {
    return "Image";
  }
  if (type === "video") {
    return "Video";
  }
  if (type === "json") {
    return "JSON";
  }
  return "Other";
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function normalizeQueryValue(value: string | null): string {
  if (!value) {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export default function MediaLibraryPage() {
  const searchParams = useSearchParams();
  const mediaIdFromQuery = searchParams.get("mediaId");
  const queryFilter = normalizeQueryValue(searchParams.get("q"));

  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading uploaded media...");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [propertiesItem, setPropertiesItem] = useState<MediaItem | null>(null);
  const [selectedReplaceId, setSelectedReplaceId] = useState<string | null>(null);
  const [directLinks, setDirectLinks] = useState<Record<string, string>>({});
  const [focusedMediaHandled, setFocusedMediaHandled] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  async function refreshMedia(): Promise<void> {
    setLoading(true);
    try {
      const { items: fetchedItems } = await listMedia();
      setItems(fetchedItems);
      setStatus(fetchedItems.length > 0 ? "Uploaded media loaded." : "No media uploaded yet.");
    } catch {
      setItems([]);
      setStatus("Failed to load media for this session.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshMedia();

    function onMediaChanged(): void {
      void refreshMedia();
    }

    function onSignedOut(): void {
      setItems([]);
      setOpenMenuId(null);
      setPreviewItem(null);
      setPreviewObjectUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }

        return null;
      });
      setPreviewLoading(false);
      setPreviewError(null);
      setPropertiesItem(null);
      setSelectedReplaceId(null);
      setDirectLinks({});
      setStatus("Signed out. HOME cleared.");
    }

    window.addEventListener(MEDIA_UPLOADED_EVENT, onMediaChanged);
    window.addEventListener(MEDIA_LIBRARY_CHANGED_EVENT, onMediaChanged);
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut);

    return () => {
      window.removeEventListener(MEDIA_UPLOADED_EVENT, onMediaChanged);
      window.removeEventListener(MEDIA_LIBRARY_CHANGED_EVENT, onMediaChanged);
      window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut);
    };
  }, []);

  const filteredItems = useMemo(() => {
    const base = filter === "all" ? items : items.filter((item) => classifyMedia(item) === filter);
    if (!queryFilter) {
      return base;
    }

    return base.filter((item) => `${item.filename} ${item.mimeType}`.toLowerCase().includes(queryFilter));
  }, [items, filter, queryFilter]);

  useEffect(() => {
    setFocusedMediaHandled(false);
  }, [mediaIdFromQuery]);

  useEffect(() => {
    if (!previewItem) {
      return;
    }

    if (!items.some((item) => item.id === previewItem.id)) {
      setPreviewItem(null);
    }
  }, [items, previewItem]);

  useEffect(() => {
    if (!mediaIdFromQuery || focusedMediaHandled || loading) {
      return;
    }

    const target = items.find((item) => item.id === mediaIdFromQuery);
    if (target) {
      setFocusedMediaHandled(true);
      openPreview(target);
      setStatus(`Opened ${target.filename} from search.`);
      return;
    }

    setFocusedMediaHandled(true);
    setStatus("Requested media item was not found.");
  }, [focusedMediaHandled, items, loading, mediaIdFromQuery]);

  useEffect(() => {
    if (!previewItem) {
      setPreviewObjectUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }

        return null;
      });
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }

    const currentPreviewItem = previewItem;

    const controller = new AbortController();
    let disposed = false;
    let localObjectUrl: string | null = null;

    setPreviewObjectUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }

      return null;
    });
    setPreviewLoading(true);
    setPreviewError(null);

    async function loadPreviewBlob(): Promise<void> {
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = {};
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(mediaViewUrl(currentPreviewItem.id), {
          credentials: "include",
          headers,
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Preview request failed with status ${response.status}`);
        }

        const blob = await response.blob();
        if (disposed) {
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        localObjectUrl = objectUrl;
        setPreviewObjectUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current);
          }

          return objectUrl;
        });
        setPreviewLoading(false);
      } catch (error) {
        if (disposed || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }

        setPreviewLoading(false);
        setPreviewError("Preview failed to load in dialog. Use Open to view in a new tab.");
      }
    }

    void loadPreviewBlob();

    return () => {
      disposed = true;
      controller.abort();

      if (localObjectUrl) {
        URL.revokeObjectURL(localObjectUrl);
      }
    };
  }, [previewItem?.id]);

  async function onDeleteMedia(item: MediaItem): Promise<void> {
    setOpenMenuId(null);
    const shouldDelete = window.confirm(`Delete ${item.filename}? This action cannot be undone.`);
    if (!shouldDelete) {
      return;
    }

    try {
      await deleteMedia(item.id);
      setStatus(`Deleted ${item.filename}.`);
      window.dispatchEvent(new Event(MEDIA_LIBRARY_CHANGED_EVENT));
      await refreshMedia();
    } catch {
      setStatus(`Failed to delete ${item.filename}.`);
    }
  }

  async function onToggleArchive(item: MediaItem): Promise<void> {
    setOpenMenuId(null);
    try {
      await toggleMedia(item.id, { isActive: !item.isActive });
      setStatus(item.isActive ? `${item.filename} archived.` : `${item.filename} unarchived.`);
      window.dispatchEvent(new Event(MEDIA_LIBRARY_CHANGED_EVENT));
      await refreshMedia();
    } catch {
      setStatus(`Failed to update archive state for ${item.filename}.`);
    }
  }

  function onDownload(item: MediaItem): void {
    setOpenMenuId(null);
    window.open(mediaDownloadUrl(item.id), "_blank", "noopener,noreferrer");
    setStatus(`Download requested for ${item.filename}.`);
  }

  function openPreview(item: MediaItem): void {
    setOpenMenuId(null);
    setPreviewError(null);

    if (item.mimeType === "application/pdf" && isMobileDevice()) {
      window.open(mediaViewUrl(item.id), "_blank", "noopener,noreferrer");
      setStatus(`Opened ${item.filename} in a new tab for mobile PDF viewing.`);
      return;
    }

    setPreviewItem(item);
  }

  function closePreview(): void {
    setPreviewItem(null);
    setPreviewError(null);
    setPreviewLoading(false);
  }

  async function onGenerateDirectLink(item: MediaItem): Promise<void> {
    setOpenMenuId(null);
    if (!item.mimeType.startsWith("image/")) {
      setStatus("Direct links are available for images only.");
      return;
    }

    try {
      const existing = directLinks[item.id];
      if (existing) {
        await navigator.clipboard.writeText(existing);
        setStatus(`Direct link copied for ${item.filename}.`);
        return;
      }

      const created = await createImageLink(item.id);
      const url = absoluteApiUrl(created.directUrl);
      setDirectLinks((current) => ({
        ...current,
        [item.id]: url
      }));
      await navigator.clipboard.writeText(url);
      setStatus(`Direct link generated for ${item.filename}.`);
    } catch {
      setStatus(`Failed to generate direct link for ${item.filename}.`);
    }
  }

  async function onReplacePicked(file: File | null): Promise<void> {
    if (!file || !selectedReplaceId) {
      return;
    }

    const target = items.find((item) => item.id === selectedReplaceId);

    try {
      await replaceMedia(selectedReplaceId, file);
      setStatus(`Replaced ${target?.filename || "media"}. Expiry remains unchanged by policy.`);
      setSelectedReplaceId(null);
      window.dispatchEvent(new Event(MEDIA_LIBRARY_CHANGED_EVENT));
      await refreshMedia();
    } catch {
      setStatus(`Failed to replace ${target?.filename || "media"}.`);
    }
  }

  function openReplaceDialog(item: MediaItem): void {
    setOpenMenuId(null);
    setSelectedReplaceId(item.id);
    replaceInputRef.current?.click();
  }

  function renderThumbnail(item: MediaItem) {
    const kind = classifyMedia(item);

    if (kind === "image") {
      return (
        <div className="relative h-full w-full bg-surface-container-low">
          <div className="absolute inset-0 flex items-center justify-center text-primary/70">
            <span className="material-symbols-outlined text-3xl">image</span>
          </div>
          <img
            src={mediaViewUrl(item.id)}
            alt=""
            aria-hidden
            className="relative z-10 h-full w-full object-cover"
            loading="lazy"
            crossOrigin="use-credentials"
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        </div>
      );
    }

    const iconName = kind === "video" ? "movie" : kind === "json" ? "data_object" : "insert_drive_file";
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-container-low text-primary">
        <span className="material-symbols-outlined text-3xl">{iconName}</span>
      </div>
    );
  }

  function renderPreviewContent(item: MediaItem) {
    if (previewLoading) {
      return (
        <div className="flex h-full items-center justify-center rounded-lg border border-outline-variant/15 bg-surface-container-low text-sm text-on-surface-variant">
          Loading preview...
        </div>
      );
    }

    if (previewError) {
      return (
        <div className="flex h-full items-center justify-center rounded-lg border border-outline-variant/15 bg-surface-container-low px-4 text-center text-sm text-error">
          {previewError}
        </div>
      );
    }

    if (!previewObjectUrl) {
      return (
        <div className="flex h-full items-center justify-center rounded-lg border border-outline-variant/15 bg-surface-container-low text-sm text-on-surface-variant">
          Preview unavailable.
        </div>
      );
    }

    if (item.mimeType.startsWith("image/")) {
      return <img src={previewObjectUrl} alt={item.filename} className="h-full w-full rounded-lg object-contain" draggable={false} />;
    }

    if (item.mimeType.startsWith("video/")) {
      return <video src={previewObjectUrl} className="h-full w-full rounded-lg bg-black object-contain" controls autoPlay />;
    }

    if (item.mimeType === "application/pdf" || item.mimeType.startsWith("text/") || item.mimeType.includes("json")) {
      return <iframe src={previewObjectUrl} title={item.filename} className="h-full w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest" />;
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-outline-variant/15 bg-surface-container-low text-center text-sm text-on-surface-variant">
        <p>Preview is not available for this file type.</p>
        <a
          href={mediaViewUrl(item.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-outline-variant/20 bg-surface-container px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-on-surface transition-colors hover:text-primary"
        >
          Open file in new tab
        </a>
      </div>
    );
  }

  function renderActionsMenu(item: MediaItem) {
    const isImage = item.mimeType.startsWith("image/");
    return (
      <div
        className="flex w-full flex-col gap-1 rounded-md border border-outline-variant/20 bg-surface-container-low p-1.5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="w-full rounded px-3 py-2.5 text-left text-xs leading-5 text-on-surface transition-colors hover:bg-surface-container-high"
          onClick={() => {
            openReplaceDialog(item);
          }}
        >
          Replace Media
        </button>

        {isImage ? (
          <button
            type="button"
            className="w-full rounded px-3 py-2.5 text-left text-xs leading-5 text-on-surface transition-colors hover:bg-surface-container-high"
            onClick={() => {
              void onGenerateDirectLink(item);
            }}
          >
            {directLinks[item.id] ? "Copy Direct Link" : "Generate Direct Link"}
          </button>
        ) : null}

        <button
          type="button"
          className="w-full rounded px-3 py-2.5 text-left text-xs leading-5 text-on-surface transition-colors hover:bg-surface-container-high"
          onClick={() => {
            void onToggleArchive(item);
          }}
        >
          {item.isActive ? "Archive" : "Unarchive"}
        </button>

        <button
          type="button"
          className="w-full rounded px-3 py-2.5 text-left text-xs leading-5 text-on-surface transition-colors hover:bg-surface-container-high"
          onClick={() => {
            onDownload(item);
          }}
        >
          Download
        </button>

        <button
          type="button"
          className="w-full rounded px-3 py-2.5 text-left text-xs leading-5 text-on-surface transition-colors hover:bg-surface-container-high"
          onClick={() => {
            setPropertiesItem(item);
            setOpenMenuId(null);
          }}
        >
          View Properties
        </button>

        <button
          type="button"
          className="w-full rounded px-3 py-2.5 text-left text-xs leading-5 text-error transition-colors hover:bg-surface-container-high"
          onClick={() => {
            void onDeleteMedia(item);
          }}
        >
          Delete Media
        </button>
      </div>
    );
  }

  return (
    <ControlShell searchPlaceholder="Search uploaded media...">
      <div className="flex flex-col gap-6">
        <section className="flex flex-wrap items-start justify-between gap-4 md:items-end">
          <div>
            <h2 className="font-headline text-3xl font-extrabold tracking-tight text-on-surface">Media Library</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Browse uploaded media with quick actions and file-level properties.</p>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-outline-variant/15 bg-surface-container-low p-1">
            <button
              type="button"
              onClick={() => setFilterPanelOpen((current) => !current)}
              className={`grid h-9 w-9 place-items-center rounded-md transition-colors ${
                filterPanelOpen
                  ? "border border-primary/25 bg-primary/10 text-primary"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
              aria-label="Toggle file type filters"
            >
              <span className="material-symbols-outlined text-base">filter_alt</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`grid h-9 w-9 place-items-center rounded-md transition-colors ${
                viewMode === "grid"
                  ? "border border-primary/25 bg-primary/10 text-primary"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
              aria-label="Grid view"
            >
              <span className="material-symbols-outlined text-base">grid_view</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`grid h-9 w-9 place-items-center rounded-md transition-colors ${
                viewMode === "list"
                  ? "border border-primary/25 bg-primary/10 text-primary"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
              aria-label="List view"
            >
              <span className="material-symbols-outlined text-base">view_list</span>
            </button>
          </div>
        </section>

        <div className={`overflow-hidden transition-all duration-300 ${filterPanelOpen ? "mt-1 max-h-40 opacity-100" : "max-h-0 opacity-0"}`}>
          <div className="flex flex-wrap gap-1 rounded-lg border border-outline-variant/15 bg-surface-container-low p-1.5">
            {[
              { value: "all", label: "All" },
              { value: "image", label: "Images" },
              { value: "video", label: "Videos" },
              { value: "json", label: "JSON" },
              { value: "other", label: "Other" }
            ].map((option) => {
              const active = filter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setFilter(option.value as MediaFilter);
                    setOpenMenuId(null);
                  }}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    active
                      ? "border border-primary/25 bg-primary/10 text-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <section>
          <input
            ref={replaceInputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void onReplacePicked(file);
              event.target.value = "";
            }}
          />

          <p className="mb-3 text-[10px] font-label uppercase tracking-wider text-on-surface-variant">{status}</p>

          {queryFilter ? (
            <p className="mb-3 text-[10px] font-label uppercase tracking-wider text-primary">Filtered by search: {searchParams.get("q")}</p>
          ) : null}

          {loading ? <p className="text-sm text-on-surface-variant">Loading uploaded media...</p> : null}

          {!loading && filteredItems.length === 0 && queryFilter ? <p className="text-sm text-on-surface-variant">No media matched this search.</p> : null}

          {!loading && filteredItems.length === 0 && !queryFilter && filter === "all" ? <p className="text-sm text-on-surface-variant">No media in this filter yet.</p> : null}

          {!loading && filteredItems.length > 0 && viewMode === "grid" ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
              {filteredItems.map((item) => {
                const focusedBySuggestion = mediaIdFromQuery === item.id;
                const menuOpen = openMenuId === item.id;

                return (
                  <article
                    key={item.id}
                    className={`relative cursor-pointer overflow-visible rounded-xl border bg-surface-container p-3 transition-colors hover:bg-surface-container-high ${
                      menuOpen ? "z-40" : "z-0"
                    } ${
                      focusedBySuggestion ? "border-primary/35 shadow-[inset_0_0_0_1px_rgba(75,188,214,0.2)]" : "border-outline-variant/20"
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      openPreview(item);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openPreview(item);
                      }
                    }}
                  >
                  <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-lg border border-outline-variant/15 bg-surface-container-lowest">
                    {renderThumbnail(item)}
                    <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between rounded-md bg-[rgb(10_14_20_/_0.62)] px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-white/90">
                      <span className="truncate">{mediaLabel(item)}</span>
                      <span>{formatBytes(item.sizeBytes)}</span>
                    </div>
                  </div>

                  <p className="truncate text-sm font-bold text-on-surface">{item.filename}</p>
                  <p className="mt-1 truncate text-[10px] uppercase tracking-wider text-on-surface-variant">{item.mimeType}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">{item.isActive ? "Active" : "Archived"}</p>

                    <div className="z-30">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setOpenMenuId((current) => (current === item.id ? null : item.id));
                        }}
                        className="grid h-8 w-8 place-items-center rounded-full border border-outline-variant/20 bg-surface-container-low/95 text-on-surface-variant backdrop-blur transition-colors hover:text-on-surface"
                        aria-label="Open media actions"
                      >
                        <span className="material-symbols-outlined text-base">more_horiz</span>
                      </button>
                    </div>
                  </div>

                  {openMenuId === item.id ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-[80]">{renderActionsMenu(item)}</div>
                  ) : null}
                </article>
                );
              })}
            </div>
          ) : null}

          {!loading && filteredItems.length > 0 && viewMode === "list" ? (
            <div className="space-y-2">
              {filteredItems.map((item) => {
                const focusedBySuggestion = mediaIdFromQuery === item.id;
                const menuOpen = openMenuId === item.id;

                return (
                  <article
                    key={item.id}
                    className={`relative flex cursor-pointer items-center justify-between gap-4 overflow-visible rounded-lg border bg-surface-container px-4 py-3 transition-colors hover:bg-surface-container-high ${
                      menuOpen ? "z-40" : "z-0"
                    } ${
                      focusedBySuggestion ? "border-primary/35 shadow-[inset_0_0_0_1px_rgba(75,188,214,0.2)]" : "border-outline-variant/20"
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      openPreview(item);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openPreview(item);
                      }
                    }}
                  >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-on-surface">{item.filename}</p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {formatBytes(item.sizeBytes)} • {mediaLabel(item)} • {item.mimeType}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-on-surface-variant">{item.isActive ? "Active" : "Archived"}</p>
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenMenuId((current) => (current === item.id ? null : item.id));
                      }}
                      className="grid h-8 w-8 place-items-center rounded-full border border-outline-variant/20 bg-surface-container-low text-on-surface-variant transition-colors hover:text-on-surface"
                      aria-label="Open media actions"
                    >
                      <span className="material-symbols-outlined text-base">more_horiz</span>
                    </button>
                  </div>

                  {openMenuId === item.id ? (
                    <div className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-[80]">{renderActionsMenu(item)}</div>
                  ) : null}
                </article>
                );
              })}
            </div>
          ) : null}
        </section>

        {previewItem ? (
          <div
            className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgb(20_24_30_/_0.86)] p-3 sm:items-center sm:p-5"
            onClick={() => {
              closePreview();
            }}
          >
            <div
              className="flex h-[90vh] w-full max-w-6xl flex-col rounded-xl border border-outline-variant/20 bg-surface-container p-3 sm:p-5"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <div className="mb-3 flex items-start justify-between gap-3 border-b border-outline-variant/15 pb-3">
                <div className="min-w-0">
                  <h3 className="truncate font-headline text-lg font-bold text-on-surface sm:text-xl">Preview</h3>
                  <p className="mt-1 truncate text-xs text-on-surface-variant">{previewItem.filename}</p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={mediaViewUrl(previewItem.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-on-surface transition-colors hover:text-primary"
                  >
                    Open
                  </a>
                  <button
                    type="button"
                    className="rounded-md border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-on-surface"
                    onClick={() => {
                      closePreview();
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden">{renderPreviewContent(previewItem)}</div>
            </div>
          </div>
        ) : null}

        {propertiesItem ? (
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgb(20_24_30_/_0.86)] p-3 sm:items-center sm:p-5">
            <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-outline-variant/20 bg-surface-container p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-headline text-xl font-bold text-on-surface">Media Properties</h3>
                  <p className="mt-1 text-xs text-on-surface-variant">{propertiesItem.filename}</p>
                </div>

                <button
                  type="button"
                  className="rounded-md border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-xs font-bold uppercase tracking-wider text-on-surface"
                  onClick={() => setPropertiesItem(null)}
                >
                  Close
                </button>
              </div>

              <div className="grid flex-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {Object.entries(propertiesItem).map(([key, value]) => (
                  <div key={key} className="rounded-md border border-outline-variant/15 bg-surface-container-low p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{key}</p>
                    <p className="mt-1 break-all text-xs text-on-surface">{formatPropertyValue(value)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ControlShell>
  );
}
