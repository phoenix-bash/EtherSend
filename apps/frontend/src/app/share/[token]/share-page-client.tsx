"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Eye } from "lucide-react";
import {
  ApiError,
  absoluteApiUrl,
  fetchPublicBatchShare,
  shareFilePath,
  type PublicBatchShare
} from "../../../lib/api-client";

interface SharePageClientProps {
  token: string;
}

interface PreviewState {
  fileName: string;
  mimeType: string;
  sourceUrl: string;
  objectUrl?: string;
  loading: boolean;
  error?: string;
}

function revokePreviewUrl(url?: string): void {
  if (!url || !url.startsWith("blob:")) {
    return;
  }

  URL.revokeObjectURL(url);
}

function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function SharePageClient({ token }: SharePageClientProps) {
  const [data, setData] = useState<PublicBatchShare | null>(null);
  const [status, setStatus] = useState<string>("Loading shared files...");
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  function closePreview(): void {
    setPreview((current) => {
      revokePreviewUrl(current?.objectUrl);

      return null;
    });
  }

  async function openPreview(file: { filename: string; mimeType: string; id: string }): Promise<void> {
    const sourceUrl = absoluteApiUrl(shareFilePath(token, file.id, "view"));

    if (file.mimeType === "application/pdf" && isMobileDevice()) {
      window.open(sourceUrl, "_blank", "noopener,noreferrer");
      setStatus("Opened PDF in a new tab for mobile viewing.");
      closePreview();
      return;
    }

    setPreview((current) => {
      revokePreviewUrl(current?.objectUrl);

      return {
        fileName: file.filename,
        mimeType: file.mimeType,
        sourceUrl,
        loading: true
      };
    });

    try {
      const response = await fetch(sourceUrl, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`Preview request failed with status ${response.status}`);
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
          objectUrl,
          loading: false
        };
      });
    } catch {
      setPreview((current) => {
        if (!current || current.sourceUrl !== sourceUrl) {
          return current;
        }

        return {
          ...current,
          loading: false,
          error: "Unable to load file preview."
        };
      });
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchPublicBatchShare(token);
        setData(result);
        setStatus("Shared files loaded.");
      } catch (error) {
        if (error instanceof ApiError) {
          setErrorStatus(error.status);
          if (error.status === 410) {
            setStatus("This share link has expired.");
            return;
          }
        }

        setStatus("Share link is invalid or unavailable.");
      }
    }

    void load();
  }, [token]);

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

  const title = useMemo(() => {
    if (!data?.batch.name) {
      return "Shared Media Batch";
    }

    return data.batch.name;
  }, [data?.batch.name]);

  const totalBatchBytes = useMemo(() => {
    if (!data) {
      return 0;
    }

    return data.batch.files.reduce((sum, file) => sum + Number(file.sizeBytes || "0"), 0);
  }, [data]);

  const totalBatchSizeLabel = useMemo(() => {
    if (!data) {
      return "-";
    }

    return `${(totalBatchBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }, [data, totalBatchBytes]);

  const pdfPreviewUrl = useMemo(() => {
    if (!preview?.objectUrl || preview.mimeType !== "application/pdf") {
      return preview?.objectUrl;
    }

    if (data?.allowDownload) {
      return preview.objectUrl;
    }

    return `${preview.objectUrl}#toolbar=0&navpanes=0&scrollbar=0&pagemode=none`;
  }, [data?.allowDownload, preview?.mimeType, preview?.objectUrl]);

  return (
    <main className="mesh-gradient min-h-screen text-on-surface">
      <header className="glass-header fixed left-0 right-0 top-0 z-50 flex h-20 items-center justify-between px-6 md:px-12">
        <div className="flex items-center gap-4">
          <div className="signature-gradient flex h-10 w-10 items-center justify-center rounded shadow-terminal">
            <span className="material-symbols-outlined text-2xl text-on-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>
              tools_wrench
            </span>
          </div>
          <div>
            <h1 className="font-headline text-xl font-extrabold leading-none text-on-surface">LinkForge</h1>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-primary">Asset Intelligence</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden items-center gap-2 rounded bg-surface-container-lowest px-3 py-1.5 ghost-border md:flex">
            <span className="material-symbols-outlined text-sm text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              lock
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Secure Public Batch</span>
          </div>
          <div className="text-right">
            <span className="block text-[10px] font-bold uppercase tracking-tighter text-on-surface-variant">Shared by</span>
            <span className="block text-xs font-semibold text-on-surface">{data?.batch.name || "Creative Studio Alpha"}</span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 pb-24 pt-32 md:px-12">
        <section className="mb-12 grid grid-cols-1 items-end gap-8 md:grid-cols-2">
          <div>
            <div className="mb-4 inline-flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary"></span>
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">Active Batch</span>
            </div>
            <h2 className="font-headline text-4xl font-extrabold leading-[1.1] tracking-tighter text-on-surface md:text-5xl">{title}</h2>

            <div className="mt-5 flex flex-wrap gap-3">
              <div className="rounded bg-secondary-container/10 px-3 py-1 text-[10px] font-mono text-primary">
                EXPIRES: {data ? new Date(data.expiresAt).toLocaleString() : "Waiting for share details..."}
              </div>
              <div className="rounded bg-secondary-container/10 px-3 py-1 text-[10px] font-mono text-primary">SIZE: {totalBatchSizeLabel}</div>
              <div className="rounded bg-secondary-container/10 px-3 py-1 text-[10px] font-mono text-primary">ITEMS: {data ? data.batch.files.length : "-"}</div>
            </div>
          </div>

          <div className="flex flex-col gap-4 md:items-end">
            <span className="rounded-lg border border-outline-variant/20 bg-surface-container px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              {data?.allowDownload ? "Public download enabled" : "Download restricted by owner"}
            </span>
            <p className="max-w-[320px] text-[10px] font-bold uppercase tracking-widest text-on-surface-variant md:text-right">
              Files are served via tokenized secure paths. Preview policy is enforced at file level.
            </p>
          </div>
        </section>

        {!data ? (
          <div className="glass-card rounded-xl border border-outline-variant/20 p-6 text-sm">{status}</div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {data.batch.files.map((file, index) => {
              const downloadUrl = absoluteApiUrl(shareFilePath(token, file.id, "download"));
              const sizeLabel = `${(Number(file.sizeBytes) / (1024 * 1024)).toFixed(2)} MB`;
              const typeLabel = file.mimeType.split("/")[0]?.toUpperCase() || "FILE";

              return (
                <article key={file.id} className={`glass-card ghost-border flex flex-col rounded-xl border border-outline-variant/20 p-4 ${index === 0 ? "sm:col-span-2 lg:row-span-2" : ""}`}>
                  <div className={`relative mb-4 overflow-hidden rounded-lg border border-outline-variant/15 bg-surface-container-lowest ${index === 0 ? "min-h-[220px]" : "aspect-video"}`}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="material-symbols-outlined text-4xl text-on-surface-variant/30">insert_drive_file</span>
                    </div>
                    <div className="absolute left-3 top-3">
                      <span className="rounded border border-primary/30 bg-primary/20 px-2 py-1 text-[10px] font-bold uppercase text-primary">{typeLabel}</span>
                    </div>
                  </div>

                  <h3 className="truncate text-sm font-bold text-on-surface">{file.filename}</h3>
                  <p className="mt-1 text-[10px] font-medium text-on-surface-variant">
                    {file.mimeType} • {sizeLabel}
                  </p>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void openPreview(file);
                      }}
                      className="flex-1 rounded border border-outline-variant/20 bg-surface-container-low px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant transition-all hover:bg-surface-container-high hover:text-on-surface"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-4 w-4" />
                        View
                      </span>
                    </button>

                    {data.allowDownload ? (
                      <a
                        href={downloadUrl}
                        className="flex-1 rounded border border-primary/20 bg-primary/10 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-primary transition-all hover:bg-primary/20"
                      >
                        <span className="inline-flex items-center gap-1">
                          <Download className="h-4 w-4" />
                          Get File
                        </span>
                      </a>
                    ) : (
                      <span className="flex-1 rounded border border-error/20 bg-error/5 px-3 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-error/70">
                        Locked
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {preview ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgb(20_24_30_/_0.86)] p-6 backdrop-blur-md" onContextMenu={(event) => event.preventDefault()}>
            <div className="glass-card flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-outline-variant/20 shadow-2xl">
              <div className="flex items-center justify-between border-b border-outline-variant/15 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-on-surface">Preview: {preview.fileName}</p>
                  <p className="text-xs text-on-surface-variant">Right click is disabled while preview is open.</p>
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
                ) : preview.objectUrl && preview.mimeType.startsWith("image/") ? (
                  <img src={preview.objectUrl} alt={preview.fileName} className="h-full w-full rounded-lg object-contain" draggable={false} />
                ) : preview.objectUrl && preview.mimeType === "application/pdf" ? (
                  <iframe src={pdfPreviewUrl} title={preview.fileName} className="h-full w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest" />
                ) : preview.objectUrl ? (
                  <iframe src={preview.objectUrl} title={preview.fileName} className="h-full w-full rounded-lg border border-outline-variant/20 bg-surface-container-lowest" />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-lg border border-outline-variant/15 bg-surface-container-low text-sm text-on-surface-variant">
                    Preview unavailable.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {errorStatus ? <p className="mt-4 text-xs text-error">Status: {errorStatus}</p> : null}
      </div>
    </main>
  );
}
