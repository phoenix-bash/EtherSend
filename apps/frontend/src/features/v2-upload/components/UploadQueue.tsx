"use client";

import type { FileUploadState } from "../types";
import { FileProgress } from "./FileProgress";

interface UploadQueueProps {
  uploads: FileUploadState[];
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

export function UploadQueue({ uploads, onPause, onResume, onRetry, onRemove }: UploadQueueProps) {
  if (uploads.length === 0) {
    return (
      <section className="rounded-xl border border-outline-variant/25 bg-surface-container-low p-4">
        <p className="text-sm text-on-surface-variant">No files in queue yet.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-outline-variant/25 bg-surface-container-low p-4">
      <div className="space-y-3">
        {uploads.map((item) => (
          <FileProgress key={item.id} item={item} onPause={onPause} onResume={onResume} onRetry={onRetry} onRemove={onRemove} />
        ))}
      </div>
    </section>
  );
}
