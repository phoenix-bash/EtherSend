"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Power, Trash2, Link2, Copy, Eye } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  ApiError,
  absoluteApiUrl,
  createBatch,
  createImageLink,
  createOrRefreshBatchShare,
  deleteMedia,
  getAccessToken,
  listMedia,
  mediaPdfPagesUrl,
  mediaPreviewPdfUrl,
  mediaPptxSlidesUrl,
  mediaViewUrl,
  replaceMedia,
  sendBatchShareEmail,
  toggleMedia,
  updateBatchShare,
  type MediaItem
} from "../../lib/api-client";
import { copyTextToClipboard } from "../../lib/clipboard";
import { MEDIA_LIBRARY_CHANGED_EVENT, MEDIA_UPLOADED_EVENT, SIGNED_OUT_EVENT, SYSTEM_LOG_EVENT, type SystemLogLevel } from "../../lib/events";
import { useAuthSession } from "../../hooks/use-auth-session";
import { formatDateTimeDdMmYyyyHm } from "../../lib/utils";
import { createPortal } from "react-dom";
import { FileViewer } from "../../components/file-viewer";

interface GeneratedLinkQr {
  url: string;
  label: string;
  expiresAt?: string;
}

interface PreviewState {
  fileName: string;
  originalFileName: string;
  mimeType: string;
  sourceUrl: string;
  objectUrl?: string;
  blob?: Blob;
  textContent?: string;
  pdfPageImageUrls?: string[];
  pptxSlideImageUrls?: string[];
  loading: boolean;
  error?: string;
}

const TEXT_FILE_EXTENSIONS = new Set([
  "txt",
  "md",
  "csv",
  "tsv",
  "log",
  "ini",
  "cfg",
  "conf",
  "env",
  "json",
  "jsonc",
  "yaml",
  "yml",
  "xml",
  "toml",
  "c",
  "h",
  "cpp",
  "hpp",
  "cc",
  "cxx",
  "java",
  "kt",
  "kts",
  "py",
  "rb",
  "php",
  "go",
  "rs",
  "swift",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "sql",
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "css",
  "scss",
  "less",
  "html",
  "htm",
  "vue",
  "svelte",
  "dart",
  "r",
  "pl",
  "lua",
  "dockerfile",
  "makefile"
]);

function revokePreviewUrl(url?: string): void {
  if (!url || !url.startsWith("blob:")) {
    return;
  }

  URL.revokeObjectURL(url);
}

function isTextPreviewMime(mimeType: string): boolean {
  if (mimeType.startsWith("text/")) {
    return true;
  }

  const normalized = mimeType.toLowerCase();
  if (
    normalized === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    normalized === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    normalized === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    normalized === "application/vnd.ms-excel" ||
    normalized === "application/vnd.ms-powerpoint" ||
    normalized === "application/msword"
  ) {
    return false;
  }

  return (
    normalized.includes("json") ||
    normalized === "application/xml" ||
    normalized === "text/xml" ||
    normalized.includes("yaml") ||
    normalized.includes("x-yaml") ||
    normalized.includes("toml") ||
    normalized.includes("x-sh") ||
    normalized.includes("x-shellscript") ||
    normalized.includes("x-python") ||
    normalized.includes("x-java") ||
    normalized.includes("x-c") ||
    normalized.includes("x-c++") ||
    normalized.includes("x-cpp") ||
    normalized.includes("x-typescript") ||
    normalized.includes("x-javascript") ||
    normalized.includes("x-rust") ||
    normalized.includes("sql") ||
    normalized.includes("markdown") ||
    normalized === "application/javascript" ||
    normalized === "application/x-javascript"
  );
}

function hasTextPreviewExtension(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (TEXT_FILE_EXTENSIONS.has(normalized)) {
    return true;
  }

  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === normalized.length - 1) {
    return false;
  }

  return TEXT_FILE_EXTENSIONS.has(normalized.slice(dotIndex + 1));
}

function isPptxFile(mimeType: string, fileName: string): boolean {
  const normalizedMime = mimeType.toLowerCase();
  if (
    normalizedMime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    normalizedMime === "application/vnd.ms-powerpoint"
  ) {
    return true;
  }

  const normalizedFileName = fileName.trim().toLowerCase();
  return normalizedFileName.endsWith(".pptx") || normalizedFileName.endsWith(".ppt");
}

function isPdfFile(mimeType: string, fileName: string): boolean {
  if (mimeType.trim().toLowerCase() === "application/pdf") {
    return true;
  }

  const normalizedFileName = fileName.trim().toLowerCase();
  return normalizedFileName.endsWith(".pdf");
}

function isOfficeDocument(mimeType: string, fileName: string): boolean {
  const normalizedMime = mimeType.toLowerCase();
  if (
    normalizedMime.includes("application/msword") ||
    normalizedMime.includes("application/vnd.ms-") ||
    normalizedMime.includes("application/vnd.openxmlformats-officedocument") ||
    normalizedMime.includes("application/vnd.oasis.opendocument")
  ) {
    return true;
  }

  if (normalizedMime === "text/plain" || normalizedMime === "text/html") {
    return true;
  }

  const normalizedFileName = fileName.trim().toLowerCase();
  return [".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pps", ".ppsx", ".odt", ".ods", ".odp", ".txt", ".html", ".htm"].some((ext) => normalizedFileName.endsWith(ext));
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function MediaManager() {
  const { user } = useAuthSession();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [status, setStatus] = useState("");
  const [selectedReplaceId, setSelectedReplaceId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchName, setBatchName] = useState("");
  const [batchAllowDownload, setBatchAllowDownload] = useState(false);
  const [hideFilenamesOnShare, setHideFilenamesOnShare] = useState(false);
  const [batchSharePassword, setBatchSharePassword] = useState("");
  const [batchShareRecipientEmail, setBatchShareRecipientEmail] = useState("");
  const [batchShareEmailMode, setBatchShareEmailMode] = useState(false);
  const [batchShareDialogStatus, setBatchShareDialogStatus] = useState("");
  const [batchPreviewViewLimit, setBatchPreviewViewLimit] = useState("3");
  const [batchExpiryMode, setBatchExpiryMode] = useState<"max" | "dateTime" | "duration">("max");
  const [batchExpiryDateTime, setBatchExpiryDateTime] = useState("");
  const [batchDurationHours, setBatchDurationHours] = useState("2");
  const [batchDurationMinutes, setBatchDurationMinutes] = useState("15");
  const [batchShareAll, setBatchShareAll] = useState(false);
  const [batchShareModalOpen, setBatchShareModalOpen] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchSharePreview, setBatchSharePreview] = useState<{ url: string; expiresAt?: string } | null>(null);
  const [directLinks, setDirectLinks] = useState<Record<string, { url: string; expiresAt: string }>>({});
  const [generatedLinkQr, setGeneratedLinkQr] = useState<GeneratedLinkQr | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
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

  useEffect(() => {
    if (!preview) {
      return;
    }

    function onContextMenu(event: MouseEvent): void {
      event.preventDefault();
    }

    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [preview]);

  useEffect(() => {
    return () => {
      setPreview((current) => {
        revokePreviewUrl(current?.objectUrl);
        return null;
      });
    };
  }, []);

  function resetBatchShareFlowState(): void {
    setBatchShareEmailMode(false);
    setBatchShareDialogStatus("");
    setBatchSharePassword("");
    setBatchShareRecipientEmail("");
    setBatchPreviewViewLimit("3");
    setBatchExpiryMode("max");
    setBatchExpiryDateTime("");
    setBatchDurationHours("2");
    setBatchDurationMinutes("15");
    setBatchId(null);
    setBatchSharePreview(null);
    setBatchCopyState("idle");
    setSelectedIds([]);
    setBatchShareAll(false);
  }

  function closeBatchShareModal(): void {
    setBatchShareModalOpen(false);
    resetBatchShareFlowState();
  }

  function closePreview(): void {
    setPreview((current) => {
      revokePreviewUrl(current?.objectUrl);
      return null;
    });
  }

  useEffect(() => {
    function onEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }

      if (preview) {
        event.preventDefault();
        closePreview();
        return;
      }

      if (batchShareModalOpen) {
        event.preventDefault();
        closeBatchShareModal();
      }
    }

    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("keydown", onEscape);
    };
  }, [batchShareModalOpen, preview]);

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
    const shared =
      "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-label uppercase tracking-wide transition-all duration-150";

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

  function openDateTimePicker(target: HTMLInputElement): void {
    (target as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
  }

  async function openPreview(item: MediaItem): Promise<void> {
    const sourceUrl = mediaViewUrl(item.id);
    const pptxFile = isPptxFile(item.mimeType, item.filename);
    const pdfFile = isPdfFile(item.mimeType, item.filename);
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    setPreview((current) => {
      revokePreviewUrl(current?.objectUrl);
      return {
        fileName: item.filename,
        originalFileName: item.filename,
        mimeType: item.mimeType,
        sourceUrl,
        loading: true
      };
    });

    try {
      if (pptxFile) {
        const slidesResponse = await fetch(mediaPptxSlidesUrl(item.id), { credentials: "include", headers });
        if (slidesResponse.ok) {
          const payload = (await slidesResponse.json()) as { slides?: string[] };
          const slideUrls = (payload.slides ?? []).map((slidePath) => absoluteApiUrl(slidePath));

          if (slideUrls.length > 0) {
            setPreview((current) => {
              if (!current || current.sourceUrl !== sourceUrl) {
                return current;
              }

              return {
                ...current,
                mimeType: item.mimeType,
                pptxSlideImageUrls: slideUrls,
                pdfPageImageUrls: undefined,
                loading: false
              };
            });
            return;
          }
        }
      }

      if (isMobileDevice() && pdfFile) {
        const pagesResponse = await fetch(mediaPdfPagesUrl(item.id), { credentials: "include", headers });
        if (pagesResponse.ok) {
          const payload = (await pagesResponse.json()) as { pages?: string[] };
          const pageUrls = (payload.pages ?? []).map((pagePath) => absoluteApiUrl(pagePath));

          if (pageUrls.length > 0) {
            setPreview((current) => {
              if (!current || current.sourceUrl !== sourceUrl) {
                return current;
              }

              return {
                ...current,
                mimeType: "application/pdf",
                pdfPageImageUrls: pageUrls,
                loading: false
              };
            });
            return;
          }
        }
      }

      if (isOfficeDocument(item.mimeType, item.filename) && !pdfFile) {
        const officePreviewResponse = await fetch(mediaPreviewPdfUrl(item.id), { credentials: "include", headers });
        if (officePreviewResponse.ok) {
          const blob = await officePreviewResponse.blob();
          const objectUrl = URL.createObjectURL(blob);
          setPreview((current) => {
            if (!current || current.sourceUrl !== sourceUrl) {
              URL.revokeObjectURL(objectUrl);
              return current;
            }

            return {
              ...current,
              mimeType: "application/pdf",
              blob,
              objectUrl,
              loading: false
            };
          });
          return;
        }
      }

      const response = await fetch(sourceUrl, { credentials: "include", headers });
      if (!response.ok) {
        throw new Error(`Preview request failed with status ${response.status}`);
      }

      const resolvedMimeType = (response.headers.get("content-type") || item.mimeType).split(";")[0].trim();

      if (isTextPreviewMime(resolvedMimeType) || hasTextPreviewExtension(item.filename)) {
        const textContent = await response.text();
        setPreview((current) => {
          if (!current || current.sourceUrl !== sourceUrl) {
            return current;
          }

          return {
            ...current,
            mimeType: resolvedMimeType,
            textContent,
            loading: false
          };
        });
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setPreview((current) => {
        if (!current || current.sourceUrl !== sourceUrl) {
          URL.revokeObjectURL(objectUrl);
          return current;
        }

        return {
          ...current,
          mimeType: resolvedMimeType,
          blob,
          objectUrl,
          pdfPageImageUrls: undefined,
          loading: false
        };
      });
    } catch (caughtError) {
      setPreview((current) => {
        if (!current || current.sourceUrl !== sourceUrl) {
          return current;
        }

        return {
          ...current,
          loading: false,
          error: caughtError instanceof Error ? caughtError.message : "Unable to load file preview."
        };
      });
    }
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
      setBatchShareModalOpen(false);
      setBatchShareEmailMode(false);
      setBatchShareDialogStatus("");
      setBatchSharePassword("");
      setBatchShareRecipientEmail("");
      setBatchPreviewViewLimit("3");
      setSelectedReplaceId(null);
      setBatchId(null);
      setBatchSharePreview(null);
      setDirectLinks({});
      setGeneratedLinkQr(null);
      closePreview();
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
      const response = await toggleMedia(item.id, { isActive: !item.isActive });
      setItems((current) => current.map((existing) => (existing.id === response.media.id ? response.media : existing)));
      setStatus("");
      emitLibraryChange();
      emitSystemLog(item.isActive ? `Media archived: ${item.filename}.` : `Media re-activated: ${item.filename}.`, item.isActive ? "warning" : "success");
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setStatus(caughtError.message || `Failed to update status for ${item.filename}.`);
        return;
      }

      setStatus(`Failed to update status for ${item.filename}.`);
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

  function toggleSelectedFromArchive(itemId: string, checked: boolean): void {
    if (batchShareAll) {
      const allIds = items.map((item) => item.id);
      setBatchShareAll(false);
      setSelectedIds(checked ? allIds : allIds.filter((id) => id !== itemId));
      return;
    }

    toggleSelected(itemId, checked);
  }

  async function createBatchShare(options?: { skipCopy?: boolean }): Promise<string | null> {
    const targetMediaIds = batchShareAll ? items.map((item) => item.id) : selectedIds;

    if (targetMediaIds.length === 0) {
      const message = batchShareAll ? "No media available to share." : "Select at least one media file to create a batch share.";
      setStatus(message);
      setBatchShareDialogStatus(message);
      return null;
    }

    const customExpiry = (() => {
      if (!user || batchExpiryMode === "max") {
        return undefined;
      }

      if (batchExpiryMode === "dateTime") {
        if (!batchExpiryDateTime) {
          return null;
        }

        return {
          expiresAt: new Date(batchExpiryDateTime).toISOString()
        };
      }

      const hours = Math.max(0, Number(batchDurationHours) || 0);
      const minutes = Math.max(0, Number(batchDurationMinutes) || 0);
      const durationMinutes = hours * 60 + minutes;
      if (durationMinutes <= 0) {
        return null;
      }

      return {
        durationMinutes
      };
    })();

    if (customExpiry === null) {
      const message = batchExpiryMode === "dateTime" ? "Select a valid expiry date and time." : "Duration must be greater than 0 minutes.";
      setStatus(message);
      setBatchShareDialogStatus(message);
      return null;
    }

    const previewViewLimit = !batchAllowDownload ? Math.max(1, Math.min(5, Number(batchPreviewViewLimit) || 3)) : undefined;

    try {
      const batchResult = await createBatch(targetMediaIds, batchName || undefined);
      const shareResult = await createOrRefreshBatchShare(
        batchResult.batch.id,
        batchAllowDownload,
        hideFilenamesOnShare,
        user ? batchSharePassword : undefined,
        previewViewLimit,
        customExpiry
      );
      const publicUrl = shareResult.share.publicUrl ?? `${window.location.origin}${shareResult.share.publicPath}`;

      setBatchId(batchResult.batch.id);
      setBatchAllowDownload(shareResult.share.allowDownload);
      setBatchPreviewViewLimit(String(shareResult.share.previewViewLimit ?? previewViewLimit ?? 3));
      setBatchSharePreview({
        url: publicUrl,
        expiresAt: shareResult.share.expiresAt
      });

      if (!options?.skipCopy) {
        const copied = await copyTextToClipboard(publicUrl);
        if (copied) {
          markBatchCopied();
          setStatus("");
        } else {
          setStatus("Batch share created. Copy failed on this device.");
        }
      }

      setBatchShareDialogStatus("Share link generated.");

      emitLibraryChange();
      emitSystemLog(`Batch share generated for ${batchResult.batch.name}.`, "success");
      return batchResult.batch.id;
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        const message = caughtError.message || "Failed to create batch share link.";
        setStatus(message);
        setBatchShareDialogStatus(message);
        return null;
      }

      setStatus("Failed to create batch share link.");
      setBatchShareDialogStatus("Failed to create batch share link.");
      return null;
    }
  }

  async function updateDownloadSetting(nextAllowDownload: boolean): Promise<void> {
    setBatchAllowDownload(nextAllowDownload);

    if (!batchId) {
      return;
    }

    const previewViewLimit = !nextAllowDownload ? Math.max(1, Math.min(5, Number(batchPreviewViewLimit) || 3)) : undefined;

    try {
      const updated = await updateBatchShare(batchId, nextAllowDownload, hideFilenamesOnShare, undefined, previewViewLimit);
      setBatchAllowDownload(updated.share.allowDownload);
      setBatchPreviewViewLimit(String(updated.share.previewViewLimit ?? previewViewLimit ?? 3));
      setBatchSharePreview((current) => {
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

  async function updateHideFilenamesSetting(nextHideFilenames: boolean): Promise<void> {
    setHideFilenamesOnShare(nextHideFilenames);

    if (!batchId) {
      return;
    }

    const previewViewLimit = !batchAllowDownload ? Math.max(1, Math.min(5, Number(batchPreviewViewLimit) || 3)) : undefined;

    try {
      const updated = await updateBatchShare(batchId, batchAllowDownload, nextHideFilenames, undefined, previewViewLimit);
      setBatchAllowDownload(updated.share.allowDownload);
      setBatchPreviewViewLimit(String(updated.share.previewViewLimit ?? previewViewLimit ?? 3));
      setBatchSharePreview((current) => {
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
      emitSystemLog(nextHideFilenames ? "Shared filenames hidden." : "Shared filenames visible.");
    } catch {
      setStatus("Failed to update shared filename visibility.");
    }
  }

  async function copyBatchShare(): Promise<void> {
    if (!batchSharePreview) {
      return;
    }

    const copied = await copyTextToClipboard(batchSharePreview.url);
    if (copied) {
      markBatchCopied();
      setStatus("");
      emitSystemLog("Batch share link copied.");
      return;
    }

    setStatus("Failed to copy batch share link.");
  }

  async function deliverBatchShareByEmail(): Promise<void> {
    const recipientEmail = batchShareRecipientEmail.trim();
    if (!recipientEmail) {
      const message = "Enter a recipient email address.";
      setStatus(message);
      setBatchShareDialogStatus(message);
      return;
    }

    let targetBatchId = batchId;
    if (!targetBatchId) {
      const createdBatchId = await createBatchShare({ skipCopy: true });
      if (!createdBatchId) {
        return;
      }

      targetBatchId = createdBatchId;
    }

    try {
      await sendBatchShareEmail(targetBatchId, recipientEmail);
      setStatus("Batch share email sent.");
      setBatchShareDialogStatus("Batch share email sent.");
      emitSystemLog(`Batch share email sent to ${recipientEmail}.`, "success");
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        const message = caughtError.message || "Unable to send batch share email.";
        setStatus(message);
        setBatchShareDialogStatus(message);
        return;
      }

      setStatus("Unable to send batch share email.");
      setBatchShareDialogStatus("Unable to send batch share email.");
    }
  }

  const batchShareModal = batchShareModalOpen
    ? createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgb(20_24_30_/_0.8)] p-4 backdrop-blur-sm" onClick={closeBatchShareModal}>
          <div
            className="w-full max-w-[38rem] rounded-2xl border border-outline-variant/25 bg-surface-container p-4 shadow-2xl lg:max-w-[38rem]"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-on-surface">Configure Access</p>
                <p className="mt-1 text-xs text-on-surface-variant">Set expiry, preview policy, and generate your share link.</p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-outline-variant/20 bg-surface-container-high px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-on-surface"
                onClick={closeBatchShareModal}
              >
                Close
              </button>
            </div>

            {user ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/45 bg-surface-container-highest/75 px-2.5 py-1.5 text-xs uppercase tracking-wider text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:border-outline-variant/35 dark:bg-surface-container-high dark:shadow-none">
                    <label htmlFor="batch-expiry-mode" className="font-label whitespace-nowrap">
                      Link expiry
                    </label>
                    <select
                      id="batch-expiry-mode"
                      value={batchExpiryMode}
                      onChange={(event) => {
                        setBatchExpiryMode(event.target.value as "max" | "dateTime" | "duration");
                      }}
                      className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-container-lowest px-2 py-1 text-[11px] text-on-surface"
                    >
                      <option value="max">Max allowed</option>
                      <option value="dateTime">Date & time</option>
                      <option value="duration">Duration</option>
                    </select>
                  </div>

                  {!batchAllowDownload ? (
                    <div className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/45 bg-surface-container-highest/75 px-2.5 py-1.5 text-xs uppercase tracking-wider text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:border-outline-variant/35 dark:bg-surface-container-high dark:shadow-none">
                      <label htmlFor="batch-preview-view-limit" className="font-label whitespace-nowrap">
                        Preview limit
                      </label>
                      <select
                        id="batch-preview-view-limit"
                        value={batchPreviewViewLimit}
                        onChange={(event) => {
                          setBatchPreviewViewLimit(event.target.value);
                        }}
                        className="min-w-0 rounded-md border border-outline-variant/20 bg-surface-container-lowest px-2 py-1 text-[11px] text-on-surface"
                      >
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                      </select>
                    </div>
                  ) : null}
                </div>

                {batchExpiryMode === "dateTime" ? (
                  <input
                    type="datetime-local"
                    value={batchExpiryDateTime}
                    onChange={(event) => {
                      setBatchExpiryDateTime(event.target.value);
                    }}
                    onFocus={(event) => {
                      openDateTimePicker(event.currentTarget);
                    }}
                    onClick={(event) => {
                      openDateTimePicker(event.currentTarget);
                    }}
                    className="themed-datetime-input w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-2.5 py-1.5 text-sm text-on-surface"
                  />
                ) : null}

                {batchExpiryMode === "duration" ? (
                  <div className="flex items-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-2.5 py-1.5 text-xs text-on-surface">
                    <input
                      type="number"
                      min={0}
                      value={batchDurationHours}
                      onChange={(event) => {
                        setBatchDurationHours(event.target.value);
                      }}
                      className="w-16 rounded border border-outline-variant/25 bg-surface-container px-2 py-1 text-xs text-on-surface"
                    />
                    <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">hours</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={batchDurationMinutes}
                      onChange={(event) => {
                        setBatchDurationMinutes(event.target.value);
                      }}
                      className="w-16 rounded border border-outline-variant/25 bg-surface-container px-2 py-1 text-xs text-on-surface"
                    />
                    <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">minutes</span>
                  </div>
                ) : null}

                <div className="space-y-1">
                  <label htmlFor="batch-share-password" className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                    Optional password
                  </label>
                  <input
                    id="batch-share-password"
                    type="text"
                    value={batchSharePassword}
                    onChange={(event) => {
                      setBatchSharePassword(event.target.value);
                    }}
                    placeholder="Leave blank for no password"
                    className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-2.5 py-1.5 text-sm text-on-surface"
                  />
                </div>

                {batchShareEmailMode ? (
                  <div className="space-y-1">
                    <label htmlFor="batch-share-recipient-email" className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                      Recipient email
                    </label>
                    <input
                      id="batch-share-recipient-email"
                      type="email"
                      value={batchShareRecipientEmail}
                      onChange={(event) => {
                        setBatchShareRecipientEmail(event.target.value);
                      }}
                      placeholder="receiver@example.com"
                      className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-2.5 py-1.5 text-sm text-on-surface"
                    />
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant">Custom link expiry is available for signed-in users only.</p>
            )}

            <div className="mt-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="rounded-lg bg-gradient-to-r from-primary to-primary-container px-2.5 py-1.5 text-xs font-label font-bold uppercase tracking-wider text-on-primary-container transition-all hover:scale-[1.01]"
                  onClick={() => {
                    void createBatchShare();
                  }}
                >
                  Generate link
                </button>
                {user ? (
                  <button
                    type="button"
                    className="rounded-lg border border-outline-variant/20 bg-surface-container px-2.5 py-1.5 text-xs font-label font-bold uppercase tracking-wider text-on-surface transition-all hover:text-primary"
                    onClick={() => {
                      if (!batchShareEmailMode) {
                        setBatchShareEmailMode(true);
                        setBatchShareDialogStatus("Enter recipient email to send anonymously.");
                        return;
                      }

                      void deliverBatchShareByEmail();
                    }}
                  >
                    {batchShareEmailMode ? "Send email" : "Share anonymously"}
                  </button>
                ) : null}
              </div>
            </div>

            {batchShareDialogStatus ? (
              <p className="mt-2 text-xs text-on-surface-variant">{batchShareDialogStatus}</p>
            ) : null}

            {batchSharePreview ? (
              <div className="mt-4 rounded-lg border border-outline-variant/20 bg-surface-container-high p-3">
                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="text-[10px] font-label uppercase tracking-wider text-on-surface-variant">Share QR</p>
                  <div className="rounded-lg bg-white p-2">
                    <QRCodeSVG value={batchSharePreview.url} size={120} includeMargin />
                  </div>
                  <p className="break-all text-xs text-on-surface">{batchSharePreview.url}</p>
                  {batchSharePreview.expiresAt ? (
                    <p className="text-[10px] uppercase tracking-wider text-primary">Expires: {formatDateTimeDdMmYyyyHm(batchSharePreview.expiresAt)}</p>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/20 bg-surface-container px-3 py-2 text-[10px] font-label uppercase tracking-wider text-on-surface transition-all hover:text-primary"
                    onClick={() => {
                      void copyBatchShare();
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    {batchCopyState === "copied" ? "(Copied)" : "Copy share link"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>,
        document.body
      )
    : null;

  const activeItems = items.filter((item) => item.isActive).length;
  const downloadableItems = items.filter((item) => item.allowDownload).length;
  const batchShareTargetCount = batchShareAll ? items.length : selectedIds.length;

  return (
    <section className="dashboard-section-band relative overflow-hidden border border-outline-variant/20 bg-surface-container-low/80 p-5 backdrop-blur-xl sm:p-6">
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
        className="dashboard-section-band mb-4 rounded-xl border border-outline-variant/20 bg-surface-container/80 p-3 backdrop-blur-lg"
      >
        <p className="text-sm font-bold uppercase tracking-wider text-on-surface">Batch Share</p>
        <p className="mt-1 text-xs text-on-surface-variant">Create one public share page for selected files. Recipients can view files without signing in.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] lg:items-center">
          <input
            value={batchName}
            onChange={(event) => {
              setBatchName(event.target.value);
            }}
            placeholder="Batch name (optional)"
            className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-2.5 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:ring-0 sm:col-span-2 lg:col-span-1"
          />
          <div className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/45 bg-surface-container-highest/75 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:border-outline-variant/35 dark:bg-surface-container-high dark:shadow-none">
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
          <div className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/45 bg-surface-container-highest/75 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:border-outline-variant/35 dark:bg-surface-container-high dark:shadow-none">
            <span className="font-label">Hide filenames</span>
            <button
              type="button"
              role="switch"
              aria-checked={hideFilenamesOnShare}
              aria-label="Hide filenames on shared link"
              className={`relative inline-flex h-5 w-10 items-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-1 focus-visible:ring-offset-surface-container-high ${
                hideFilenamesOnShare
                  ? "border-primary/80 bg-primary-container shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] dark:bg-primary"
                  : "border-outline/80 bg-[rgb(188_199_212_/_0.95)] shadow-[inset_0_1px_2px_rgba(17,28,40,0.22)] dark:border-outline-variant/80 dark:bg-surface-container-low"
              }`}
              onClick={() => {
                void updateHideFilenamesSetting(!hideFilenamesOnShare);
              }}
            >
              <span
                className={`absolute left-1 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-[rgb(95_109_126_/_0.75)] bg-white shadow-[0_1px_2px_rgba(16,26,38,0.3)] transition-transform dark:border-slate-200/40 dark:bg-slate-100 ${
                  hideFilenamesOnShare ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/45 bg-surface-container-highest/75 px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:border-outline-variant/35 dark:bg-surface-container-high dark:shadow-none">
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
            className="rounded-lg bg-gradient-to-r from-primary to-primary-container px-2.5 py-1.5 text-[10px] font-label font-bold uppercase tracking-wider text-on-primary-container transition-all hover:scale-[1.01]"
            onClick={() => {
              setBatchShareModalOpen(true);
            }}
          >
            Share link ({batchShareTargetCount})
          </button>
        </div>
      </div>

      {batchShareModal}

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          void onReplacePicked(file);
        }}
      />

      <div className="dashboard-section-band relative overflow-hidden rounded-xl border border-outline-variant/15 bg-surface-container-lowest/45 px-1 py-1 backdrop-blur-xl sm:px-1.5 sm:py-1.5">
        <div className="divide-y divide-outline-variant/10 md:hidden">
          {items.length > 0 ? (
            items.map((item) => {
              const isSelected = batchShareAll || selectedIds.includes(item.id);
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
                        toggleSelectedFromArchive(item.id, !isSelected);
                      }}
                    >
                      <span className={`material-symbols-outlined text-[13px] transition-opacity ${isSelected ? "opacity-100" : "opacity-0"}`}>done</span>
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-on-surface" title={item.filename}>{item.filename}</p>

                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] text-on-surface-variant" title={`${item.mimeType} • ${asMegabytes(item.sizeBytes)}`}>{item.mimeType} • {asMegabytes(item.sizeBytes)}</span>
                      </div>

                      <div className="mt-2 flex flex-nowrap items-center justify-end gap-1.5">
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
                              <span className="hidden md:inline">{directLinks[item.id] ? "Copy Link" : "Direct Link"}</span>
                            </button>
                          ) : null}
                          <button
                            className={actionButtonClass(`${item.id}:preview`)}
                            aria-label="preview media"
                            onClick={() => {
                              flashAction(`${item.id}:preview`);
                              void openPreview(item);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span className="hidden md:inline">Preview</span>
                          </button>
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
                            <span className="hidden md:inline">Replace</span>
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
                            <span className="hidden md:inline">{item.isActive ? "Archive" : "Unarchive"}</span>
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
                            <span className="hidden md:inline">Delete</span>
                          </button>
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
              <col className="w-[34rem]" />
            </colgroup>
            <tbody className="divide-y divide-outline-variant/10">
              {items.length > 0 ? (
                items.map((item) => {
                  const isSelected = batchShareAll || selectedIds.includes(item.id);
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
                            toggleSelectedFromArchive(item.id, !isSelected);
                          }}
                        >
                          <span className={`material-symbols-outlined text-[13px] transition-opacity ${isSelected ? "opacity-100" : "opacity-0"}`}>done</span>
                        </button>
                      </td>
                      <td
                        className="cursor-pointer pl-4 pr-2 py-2 align-top"
                        onClick={() => {
                          toggleSelectedFromArchive(item.id, !isSelected);
                        }}
                      >
                        <p className="max-w-full truncate font-semibold text-on-surface" title={item.filename}>{item.filename}</p>
                        <p className="truncate text-[11px] text-on-surface-variant" title={`${item.mimeType} • ${asMegabytes(item.sizeBytes)}`}>{item.mimeType} • {asMegabytes(item.sizeBytes)}</p>
                      </td>
                      <td className="px-2 py-2 align-top whitespace-nowrap">
                        <div className="flex flex-nowrap justify-end gap-1.5">
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
                              <span>{directLinks[item.id] ? "Copy Link" : "Direct Link"}</span>
                            </button>
                          ) : null}
                          <button
                            className={actionButtonClass(`${item.id}:preview`)}
                            aria-label="preview media"
                            onClick={() => {
                              flashAction(`${item.id}:preview`);
                              void openPreview(item);
                            }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Preview</span>
                          </button>
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
                            <span>Replace</span>
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
                            <span>{item.isActive ? "Archive" : "Unarchive"}</span>
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
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={3} className="px-2 py-8 text-center text-sm text-on-surface-variant">
                    No media indexed yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dashboard-section-band mt-4 grid grid-cols-3 gap-1.5 rounded-xl border border-outline-variant/15 bg-surface-container p-2">
        <div className="surface-soft rounded-md border border-outline-variant/15 bg-surface-container p-2">
          <div className="flex items-center justify-between gap-1">
            <p className="truncate text-[10px] font-label uppercase tracking-wider text-on-surface-variant">Indexed</p>
            <p className="font-headline text-sm font-bold text-on-surface">{items.length}</p>
          </div>
        </div>
        <div className="surface-soft rounded-md border border-outline-variant/15 bg-surface-container p-2">
          <div className="flex items-center justify-between gap-1">
            <p className="truncate text-[10px] font-label uppercase tracking-wider text-on-surface-variant">Active</p>
            <p className="font-headline text-sm font-bold text-on-surface">{activeItems}</p>
          </div>
        </div>
        <div className="surface-soft rounded-md border border-outline-variant/15 bg-surface-container p-2">
          <div className="flex items-center justify-between gap-1">
            <p className="truncate text-[10px] font-label uppercase tracking-wider text-on-surface-variant">Download</p>
            <p className="font-headline text-sm font-bold text-on-surface">{downloadableItems}</p>
          </div>
        </div>
      </div>

      {status ? <p className="mt-3 text-[10px] font-label uppercase tracking-widest text-on-surface-variant">{status}</p> : null}

      {preview
        ? createPortal(
            <div className="fixed inset-0 z-[75] flex items-center justify-center bg-[rgb(20_24_30_/_0.86)] p-3 sm:p-6 backdrop-blur-md" onContextMenu={(event) => event.preventDefault()}>
              <div className="glass-card my-auto flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-outline-variant/20 shadow-2xl">
                <div className="flex items-center justify-between border-b border-outline-variant/15 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-on-surface">Preview: {preview.fileName}</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg border border-outline-variant/20 bg-surface-container px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-on-surface"
                    onClick={closePreview}
                  >
                    Close
                  </button>
                </div>

                <div className="flex-1 overflow-hidden p-3">
                  {preview.loading ? (
                    <div className="flex h-full items-center justify-center rounded-lg border border-outline-variant/15 bg-surface-container-low text-sm text-on-surface-variant">
                      Loading preview...
                    </div>
                  ) : preview.error ? (
                    <div className="flex h-full items-center justify-center rounded-lg border border-outline-variant/15 bg-surface-container-low text-sm text-error">
                      {preview.error}
                    </div>
                  ) : (
                    <FileViewer
                      fileName={preview.fileName}
                      mimeType={preview.mimeType}
                      objectUrl={preview.objectUrl}
                      blob={preview.blob}
                      textContent={preview.textContent}
                      pdfPageImageUrls={preview.pdfPageImageUrls}
                      pptxSlideImageUrls={preview.pptxSlideImageUrls}
                      allowDownload={false}
                    />
                  )}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </section>
  );
}
