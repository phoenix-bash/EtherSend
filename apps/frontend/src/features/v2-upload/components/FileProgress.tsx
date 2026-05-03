"use client";

import type { FileUploadState } from "../types";

interface FileProgressProps {
  item: FileUploadState;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

function statusClass(status: FileUploadState["status"]): string {
  switch (status) {
    case "completed":
      return "bg-emerald-500/20 text-emerald-800 dark:text-emerald-200";
    case "failed":
      return "bg-rose-500/20 text-rose-800 dark:text-rose-200";
    case "paused":
      return "bg-amber-500/20 text-amber-800 dark:text-amber-200";
    case "uploading":
      return "bg-sky-500/20 text-sky-800 dark:text-sky-200";
    default:
      return "bg-outline-variant/20 text-on-surface-variant";
  }
}

function asMb(size: number): string {
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export function FileProgress({ item, onPause, onResume, onRetry, onRemove }: FileProgressProps) {
  return (
    <article className="rounded-lg border border-outline-variant/20 bg-surface-container p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-on-surface">{item.file.name}</p>
          <p className="text-xs text-on-surface-variant">{asMb(item.file.size)}</p>
        </div>

        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${statusClass(item.status)}`}>{item.status}</span>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded bg-outline-variant/20">
        <div className="h-full rounded bg-primary transition-all duration-200" style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }} />
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-on-surface-variant">
        <p>{item.progress}%</p>
        {item.fileUrl ? (
          <a href={item.fileUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            Open file
          </a>
        ) : null}
      </div>

      {item.error ? <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{item.error}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {item.status === "uploading" ? (
          <button className="rounded border border-outline-variant/35 px-2 py-1" onClick={() => onPause(item.id)}>
            Pause
          </button>
        ) : null}

        {item.status === "paused" ? (
          <button className="rounded border border-outline-variant/35 px-2 py-1" onClick={() => onResume(item.id)}>
            Resume
          </button>
        ) : null}

        {item.status === "failed" ? (
          <button className="rounded border border-outline-variant/35 px-2 py-1" onClick={() => onRetry(item.id)}>
            Retry
          </button>
        ) : null}

        <button className="rounded border border-outline-variant/35 px-2 py-1" onClick={() => onRemove(item.id)}>
          Remove
        </button>
      </div>
    </article>
  );
}
