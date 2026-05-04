"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Download, Eye } from "lucide-react";
import { FileViewer } from "../../../components/file-viewer";
import {
  API_BASE_URL,
  ApiError,
  absoluteApiUrl,
  fetchPublicBatchShare,
  shareFileOfficePagesPath,
  shareFilePath,
  resolveSecurityTeaseMessage,
  type PublicBatchShare
} from "../../../lib/api-client";
import { clearPreviewPagesCacheByScope, createPreviewPagesCacheKey, loadPreviewPagesWithCache } from "../../../lib/preview-page-cache";
import { formatDateTimeDdMmYyyyHm } from "../../../lib/utils";

interface SharePageClientProps {
  token: string;
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

function classifyMimeType(mimeType: string): "image" | "video" | "text" | "json" | "other" {
  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType.startsWith("video/")) {
    return "video";
  }

  if (mimeType.startsWith("text/")) {
    return "text";
  }

  if (mimeType.includes("json")) {
    return "json";
  }

  return "other";
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

  const extension = normalized.slice(dotIndex + 1);
  return TEXT_FILE_EXTENSIONS.has(extension);
}

function isPdfFile(file: { mimeType: string; filename: string }): boolean {
  return file.mimeType.toLowerCase() === "application/pdf" || file.filename.toLowerCase().endsWith(".pdf");
}

function isOfficeDocument(file: { mimeType: string; filename: string }): boolean {
  const normalizedMime = file.mimeType.toLowerCase();
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

  const extension = file.filename.toLowerCase().split(".").pop() || "";
  return ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pps", "ppsx", "odt", "ods", "odp", "txt", "html", "htm"].includes(extension);
}

function renderShareThumbnail(token: string, file: PublicBatchShare["batch"]["files"][number]) {
  const kind = classifyMimeType(file.mimeType);

  if (kind === "image") {
    return (
      <div className="relative h-full w-full bg-surface-container-low">
        <div className="absolute inset-0 flex items-center justify-center text-primary/70">
          <span className="material-symbols-outlined text-3xl">image</span>
        </div>
        <img
          src={absoluteApiUrl(shareFilePath(token, file.id, "view"))}
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

  const iconName = kind === "video" ? "movie" : kind === "json" || kind === "text" ? "data_object" : "insert_drive_file";
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-container-low text-primary">
      <span className="material-symbols-outlined text-3xl">{iconName}</span>
    </div>
  );
}

export function SharePageClient({ token }: SharePageClientProps) {
  const [data, setData] = useState<PublicBatchShare | null>(null);
  const [status, setStatus] = useState<string>("Loading shared files...");
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [securityLocked, setSecurityLocked] = useState(false);
  const [securityLockReason, setSecurityLockReason] = useState<string | null>(null);
  const [sharePasswordInput, setSharePasswordInput] = useState("");
  const [sharePassword, setSharePassword] = useState<string | undefined>(undefined);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const hideFilenames = Boolean(data?.hideFilenames);
  const lockActive = passwordRequired && !data;
  const isAnonymousShare = (data?.sharedBy || "").trim().toLowerCase() === "guest user";
  const isPublicLink = data ? !data.hasPassword && !isAnonymousShare : false;
  const securityLinkLabel = isPublicLink ? "Secure Public Link" : "Secure Private Link";

  const passwordHeaders = sharePassword ? { "x-share-password": sharePassword } : undefined;

  function buildPreviewHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "x-share-preview-intent": "1"
    };

    if (sharePassword) {
      headers["x-share-password"] = sharePassword;
    }

    return headers;
  }

  function triggerSecurityLock(reason: string): void {
    clearPreviewPagesCacheByScope(`share:${token}`);
    setPreview((current) => {
      revokePreviewUrl(current?.objectUrl);
      return null;
    });
    setData(null);
    setSharePassword(undefined);
    setSecurityLockReason(reason);
    setSecurityLocked(true);
    setStatus("Protected connection terminated. Refresh required.");
  }

  function closePreview(): void {
    setPreview((current) => {
      revokePreviewUrl(current?.objectUrl);

      return null;
    });
  }

  async function openPreview(file: { filename: string; mimeType: string; id: string }): Promise<void> {
    const sourceUrl = absoluteApiUrl(shareFilePath(token, file.id, "view"));
    const visibleFileName = hideFilenames ? "Filename hidden" : file.filename;
    const officePagesCacheKey = createPreviewPagesCacheKey(`share:${token}:office-pages`, file.id);
    const enforcePreviewViewLimit = Boolean(data && !data.allowDownload && data.previewViewLimit !== null);

    setPreview((current) => {
      revokePreviewUrl(current?.objectUrl);

      return {
        fileName: visibleFileName,
        originalFileName: file.filename,
        mimeType: file.mimeType,
        sourceUrl,
        loading: true
      };
    });

    try {
      if (isOfficeDocument(file) && !isPdfFile(file)) {
        const fetchOfficePageUrls = async (): Promise<string[]> => {
          const officePreviewResponse = await fetch(absoluteApiUrl(shareFileOfficePagesPath(token, file.id)), {
            credentials: "include",
            headers: buildPreviewHeaders()
          });

          if (!officePreviewResponse.ok) {
            let message = `Preview request failed with status ${officePreviewResponse.status}`;
            if (officePreviewResponse.status === 403) {
              message = "Preview is unavailable for this file type when download is disabled.";
              try {
                const payload = (await officePreviewResponse.clone().json()) as { code?: string; details?: { code?: string } };
                const code = payload.code || payload.details?.code;
                if (code === "SHARE_PREVIEW_LIMIT_REACHED") {
                  message = "Preview view limit reached for this share.";
                }
              } catch {
                // Ignore non-JSON response body.
              }
            }
            throw new Error(message);
          }

          const payload = (await officePreviewResponse.json()) as { success?: boolean; pages?: string[] };
          return (payload.pages ?? []).map((pagePath) => absoluteApiUrl(pagePath));
        };

        const pageUrls = enforcePreviewViewLimit
          ? await fetchOfficePageUrls()
          : await loadPreviewPagesWithCache({
              cacheKey: officePagesCacheKey,
              fetcher: fetchOfficePageUrls
            });

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

      const response = await fetch(sourceUrl, { credentials: "include", headers: buildPreviewHeaders() });
      if (!response.ok) {
        let message = response.status === 403 ? "Preview is unavailable for this file type when download is disabled." : `Preview request failed with status ${response.status}`;
        if (response.status === 403) {
          try {
            const payload = (await response.clone().json()) as { code?: string; details?: { code?: string } };
            const code = payload.code || payload.details?.code;
            if (code === "SHARE_PREVIEW_LIMIT_REACHED") {
              message = "Preview view limit reached for this share.";
            }
          } catch {
            // Ignore non-JSON response body.
          }
        }
        throw new Error(message);
      }

      const resolvedMimeType = (response.headers.get("content-type") || file.mimeType).split(";")[0].trim();

      if (isTextPreviewMime(resolvedMimeType) || hasTextPreviewExtension(file.filename)) {
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

  function unlockShare(): void {
    const nextPassword = sharePasswordInput.trim();
    if (!nextPassword) {
      setPasswordError("Password is required.");
      return;
    }

    setPasswordError(null);
    setSharePassword(nextPassword);
  }

  async function downloadFile(file: { filename: string; id: string }): Promise<void> {
    const sourceUrl = absoluteApiUrl(shareFilePath(token, file.id, "download"));

    try {
      const response = await fetch(sourceUrl, { credentials: "include", headers: passwordHeaders });
      if (!response.ok) {
        throw new Error(`Download request failed with status ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = hideFilenames ? "shared-file" : file.filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setStatus("");
    } catch {
      setStatus("Unable to download this file.");
    }
  }

  useEffect(() => {
    function blockContextMenu(event: Event): void {
      event.preventDefault();
    }

    function applyContextMenuProtection(): void {
      window.addEventListener("contextmenu", blockContextMenu, true);
      document.addEventListener("contextmenu", blockContextMenu, true);
      document.documentElement?.addEventListener("contextmenu", blockContextMenu, true);
      document.body?.addEventListener("contextmenu", blockContextMenu, true);
    }

    applyContextMenuProtection();
    const protectionInterval = window.setInterval(() => {
      applyContextMenuProtection();
    }, 1000);

    return () => {
      window.clearInterval(protectionInterval);
      window.removeEventListener("contextmenu", blockContextMenu, true);
      document.removeEventListener("contextmenu", blockContextMenu, true);
      document.documentElement?.removeEventListener("contextmenu", blockContextMenu, true);
      document.body?.removeEventListener("contextmenu", blockContextMenu, true);
    };
  }, []);

  useEffect(() => {
    if (securityLocked) {
      return;
    }

    async function load() {
      if (sharePassword) {
        setIsUnlocking(true);
      }

      try {
        const result = await fetchPublicBatchShare(token, sharePassword);
        setData(result);
        setPasswordRequired(result.hasPassword);
        setErrorStatus(null);
        setStatus("Shared files loaded.");
        setPasswordError(null);
      } catch (error) {
        if (error instanceof ApiError) {
          setErrorStatus(error.status);
          const teaseMessage = resolveSecurityTeaseMessage(error);

          if (error.status === 401) {
            setData(null);
            setPasswordRequired(true);
            setStatus("This share is password protected.");
            if (sharePassword) {
              setPasswordError(teaseMessage ?? "Incorrect password. Try again.");
            }
            return;
          }

          if (teaseMessage) {
            setStatus(teaseMessage);
            return;
          }

          if (error.status === 410) {
            clearPreviewPagesCacheByScope(`share:${token}`);
            setStatus("This share link has expired.");
            return;
          }
        }

        clearPreviewPagesCacheByScope(`share:${token}`);
        setStatus("Share link is invalid or unavailable.");
      } finally {
        setIsUnlocking(false);
      }
    }

    void load();
  }, [token, sharePassword, securityLocked]);

  useEffect(() => {
    if (!preview || securityLocked) {
      return;
    }

    function isScreenshotShortcut(event: KeyboardEvent): boolean {
      const normalizedKey = event.key.toLowerCase();
      const keyCode = (event as KeyboardEvent & { keyCode?: number; which?: number }).keyCode;
      const which = (event as KeyboardEvent & { keyCode?: number; which?: number }).which;
      const isPrintScreen =
        event.key === "PrintScreen" ||
        event.key === "PrtSc" ||
        event.key === "Snapshot" ||
        event.code === "PrintScreen" ||
        keyCode === 44 ||
        which === 44;
      const isWindowsSnip = (event.metaKey || event.ctrlKey) && event.shiftKey && normalizedKey === "s";
      const isMacScreenshot = event.metaKey && event.shiftKey && (normalizedKey === "3" || normalizedKey === "4" || normalizedKey === "5");

      return isPrintScreen || isWindowsSnip || isMacScreenshot;
    }

    function onScreenshotShortcut(event: KeyboardEvent): void {
      if (!isScreenshotShortcut(event)) {
        return;
      }

      event.preventDefault();
      triggerSecurityLock("Screenshot shortcut detected in protected preview.");
    }

    function closePreviewOnFocusLoss(message: string): void {
      setPreview((current) => {
        if (!current) {
          return current;
        }

        revokePreviewUrl(current.objectUrl);
        return null;
      });
      setStatus(message);
    }

    function onVisibilityChange(): void {
      if (document.visibilityState !== "hidden") {
        return;
      }

      closePreviewOnFocusLoss("Preview closed after tab switch. Open the file again to continue.");
    }

    function onWindowBlur(): void {
      closePreviewOnFocusLoss("Preview closed after window change. Open the file again to continue.");
    }

    window.addEventListener("keydown", onScreenshotShortcut, true);
    window.addEventListener("keyup", onScreenshotShortcut, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("keydown", onScreenshotShortcut, true);
      window.removeEventListener("keyup", onScreenshotShortcut, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [preview, securityLocked]);

  useEffect(() => {
    return () => {
      setPreview((current) => {
        revokePreviewUrl(current?.objectUrl);

        return null;
      });
    };
  }, []);

  const title = useMemo(() => {
    if (!data?.batch.name) {
      return "Shared Media Batch";
    }

    return data.batch.name;
  }, [data?.batch.name]);

  return (
    <main className="glass-site mesh-gradient min-h-screen text-on-surface" onContextMenu={(event) => event.preventDefault()}>
      <div className={lockActive || securityLocked ? "pointer-events-none select-none blur-sm" : undefined}>
        <header className="glass-header fixed left-0 right-0 top-0 z-50 flex h-20 items-center justify-between px-6 md:px-12">
          <Link href="/" className="flex items-center gap-4">
            <div className="signature-gradient flex h-10 w-10 items-center justify-center rounded shadow-terminal">
              <span className="material-symbols-outlined text-2xl text-on-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>
                tools_wrench
              </span>
            </div>
            <div>
              <h1 className="font-headline text-xl font-extrabold leading-none text-on-surface">EtherSend</h1>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-primary">Asset Intelligence</p>
            </div>
          </Link>

          <div className="flex items-center gap-6">
            <div className="hidden items-center gap-2 rounded bg-surface-container-lowest px-3 py-1.5 ghost-border md:flex">
              <span className="material-symbols-outlined text-sm text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
                lock
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{securityLinkLabel}</span>
            </div>
          </div>
        </header>

        <div className="w-full px-6 pb-44 pt-32 md:px-12">
          <section className="mb-12 grid grid-cols-1 items-end gap-8 md:grid-cols-2">
            <div>
              <div className="mb-4 inline-flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary"></span>
                <span className="text-xs font-semibold uppercase tracking-widest text-primary">Active Batch</span>
              </div>
              <h2 className="font-headline text-4xl font-extrabold leading-[1.1] tracking-tighter text-on-surface md:text-5xl">{title}</h2>

              <div className="mt-5 flex flex-wrap gap-3">
                <div className="rounded bg-secondary-container/10 px-3 py-1 text-[10px] font-mono text-primary">
                  EXPIRES: {data ? formatDateTimeDdMmYyyyHm(data.expiresAt) : "Waiting for share details..."}
                </div>
                <div className="rounded bg-secondary-container/10 px-3 py-1 text-[10px] font-mono text-primary">ITEMS: {data ? data.batch.files.length : "-"}</div>
              </div>
            </div>

            <div className="flex flex-col gap-4 md:items-end">
              <span className="rounded-lg border border-outline-variant/20 bg-surface-container px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                {data?.allowDownload ? "Public download enabled" : "Download restricted by owner"}
              </span>
            </div>
          </section>

          {!data ? (
            <div className="glass-card rounded-xl border border-outline-variant/20 p-6 text-sm">{status}</div>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
              {data.batch.files.map((file) => {
                return (
                  <article key={file.id} className="glass-card ghost-border flex flex-col rounded-xl border border-outline-variant/20 p-3">
                    <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-lg border border-outline-variant/15 bg-surface-container-lowest">
                      {renderShareThumbnail(token, file)}
                    </div>

                    <h3 className="truncate text-sm font-bold text-on-surface" title={hideFilenames ? undefined : file.filename}>
                      {hideFilenames ? "Filename hidden" : file.filename}
                    </h3>

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void openPreview(file);
                        }}
                        className="inline-flex flex-1 items-center justify-center rounded border border-primary/35 bg-surface-container-low px-3 py-2 text-[10px] font-bold uppercase leading-none tracking-wider text-on-surface-variant transition-all hover:border-primary/55 hover:bg-surface-container-high hover:text-on-surface"
                      >
                        <span className="inline-flex items-center justify-center gap-1 leading-none">
                          <Eye className="h-4 w-4 shrink-0" />
                          View
                        </span>
                      </button>

                      {data.allowDownload ? (
                        <button
                          type="button"
                          onClick={() => {
                            void downloadFile(file);
                          }}
                          className="inline-flex flex-1 items-center justify-center rounded border border-primary/45 bg-primary/10 px-3 py-2 text-[10px] font-bold uppercase leading-none tracking-wider text-primary transition-all hover:border-primary/60 hover:bg-primary/20"
                        >
                          <span className="inline-flex items-center justify-center gap-1 leading-none">
                            <Download className="h-4 w-4 shrink-0" />
                            Get File
                          </span>
                        </button>
                      ) : (
                        <span className="inline-flex flex-1 items-center justify-center rounded border border-primary/35 bg-error/5 px-3 py-2 text-center text-[10px] font-bold uppercase leading-none tracking-wider text-error/70">
                          Locked
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {errorStatus ? <p className="mt-4 text-xs text-error">Status: {errorStatus}</p> : null}
        </div>

        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
          <section className="pointer-events-auto w-full rounded-xl border border-outline-variant/20 bg-surface-container/95 p-4 shadow-xl backdrop-blur-md">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Build your own workspace</p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  Create account for personal media library, batch sharing, permission controls, and larger signed-in upload quota.
                </p>
              </div>
              <Link
                href="/auth/signin?returnTo=/library"
                className="inline-flex items-center justify-center rounded border border-primary/30 bg-primary/15 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-primary transition-colors hover:bg-primary/25"
              >
                Create free account
              </Link>
            </div>
          </section>
        </div>
      </div>

      {lockActive && !securityLocked ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgb(20_24_30_/_0.72)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-outline-variant/30 bg-surface-container p-5 shadow-2xl">
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Protected Share</p>
            <h2 className="mt-2 text-xl font-semibold text-on-surface">Enter password to unlock</h2>
            <p className="mt-2 text-xs text-on-surface-variant">This shared batch is encrypted behind a password gate.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                value={sharePasswordInput}
                onChange={(event) => {
                  setSharePasswordInput(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    unlockShare();
                  }
                }}
                placeholder="Enter share password"
                className="w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface"
              />
              <button
                type="button"
                className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-primary disabled:cursor-not-allowed disabled:opacity-60"
                onClick={unlockShare}
                disabled={isUnlocking}
              >
                {isUnlocking ? "Unlocking..." : "Unlock"}
              </button>
            </div>
            {passwordError ? <p className="mt-2 text-xs text-error">{passwordError}</p> : null}
          </div>
        </div>
      ) : null}

        {preview ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgb(20_24_30_/_0.86)] p-6 backdrop-blur-md" onContextMenu={(event) => event.preventDefault()}>
            <div className="glass-card flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-outline-variant/20 shadow-2xl">
              <div className="flex items-center justify-between border-b border-outline-variant/15 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-on-surface">Preview: {preview.fileName}</p>
                  <p className="mt-1 text-[11px] text-on-surface-variant">Please be patient. Free tier preview generation can take some time.</p>
                </div>
                <button
                  type="button"
                  className="rounded-lg border border-outline-variant/20 bg-surface-container px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-on-surface"
                  onClick={() => {
                    closePreview();
                  }}
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
                    allowDownload={Boolean(data?.allowDownload)}
                  />
                )}
              </div>
            </div>
          </div>
        ) : null}

      {securityLocked ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[rgb(9_12_16_/_0.94)] p-6 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl border border-error/40 bg-surface-container p-6 text-center shadow-2xl">
            <p className="text-[10px] font-bold uppercase tracking-widest text-error">Security Lockdown</p>
            <h2 className="mt-3 text-xl font-semibold text-on-surface">Connection terminated</h2>
            <p className="mt-2 text-sm text-on-surface-variant">{securityLockReason ?? "Restricted interaction detected."}</p>
            <p className="mt-2 text-xs text-on-surface-variant">Refresh the page to reconnect.</p>
          </div>
        </div>
      ) : null}

    </main>
  );
}
