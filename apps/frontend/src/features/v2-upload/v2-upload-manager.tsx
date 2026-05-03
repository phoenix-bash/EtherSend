"use client";

import { useMemo } from "react";
import { FileUploader } from "./components/FileUploader";
import { UploadQueue } from "./components/UploadQueue";
import { useUploadQueue } from "./hooks/useUploadQueue";
import { useAuthSession } from "../../hooks/use-auth-session";

export function V2UploadManager() {
  const { user } = useAuthSession();
  const { uploads, summary, enqueueFiles, pauseFile, resumeFile, retryFile, removeFile } = useUploadQueue({
    isSignedIn: Boolean(user)
  });

  const summaryLabel = useMemo(() => {
    if (summary.total === 0) {
      return "Queue is empty.";
    }

    return `${summary.completed}/${summary.total} completed • ${summary.uploading} uploading • ${summary.failed} failed`;
  }, [summary]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="font-headline text-sm uppercase tracking-widest text-on-surface">V2 Direct Upload Queue</p>
        <p className="mt-2 text-xs text-on-surface-variant">{summaryLabel}</p>
      </section>

      <FileUploader onFilesSelected={enqueueFiles} />

      <UploadQueue uploads={uploads} onPause={pauseFile} onResume={resumeFile} onRetry={retryFile} onRemove={removeFile} />
    </div>
  );
}
