"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFileUpload } from "./useFileUpload";
import type { FileUploadState } from "../types";

const MAX_FILE_CONCURRENCY = 4;
const MAX_CHUNK_CONCURRENCY = 5;
const GUEST_MAX_FILE_SIZE_BYTES = 104857600;
const SIGNED_MAX_FILE_SIZE_BYTES = 536870912;

function createUploadState(file: File): FileUploadState {
  return {
    id: crypto.randomUUID(),
    file,
    status: "queued",
    progress: 0,
    completedParts: []
  };
}

export function useUploadQueue(input: { isSignedIn: boolean }) {
  const [uploads, setUploads] = useState<FileUploadState[]>([]);
  const { uploadFile, pauseUpload } = useFileUpload();

  const maxSizeBytes = input.isSignedIn ? SIGNED_MAX_FILE_SIZE_BYTES : GUEST_MAX_FILE_SIZE_BYTES;

  const enqueueFiles = useCallback(
    (files: File[]) => {
      const sortedFiles = [...files].sort((a, b) => a.size - b.size);

      const additions = sortedFiles.map((file) => {
        const state = createUploadState(file);
        if (file.size > maxSizeBytes) {
          return {
            ...state,
            status: "failed" as const,
            error: `File exceeds size limit (${maxSizeBytes} bytes).`
          };
        }

        return state;
      });

      setUploads((current) => [...current, ...additions]);
    },
    [maxSizeBytes]
  );

  const patchUpload = useCallback((id: string, patch: Partial<FileUploadState>) => {
    setUploads((current) =>
      current.map((item) => {
        if (item.id !== id) {
          return item;
        }

        return {
          ...item,
          ...patch
        };
      })
    );
  }, []);

  const startUpload = useCallback(
    async (uploadState: FileUploadState) => {
      await uploadFile(uploadState, {
        maxChunkConcurrency: MAX_CHUNK_CONCURRENCY,
        onProgress: (value) => {
          patchUpload(uploadState.id, { progress: value, status: "uploading" });
        },
        onStarted: (patch) => {
          patchUpload(uploadState.id, {
            ...patch,
            status: "uploading"
          });
        },
        onCompleted: (patch) => {
          patchUpload(uploadState.id, patch);
        },
        onFailed: (errorMessage) => {
          patchUpload(uploadState.id, {
            status: "failed",
            error: errorMessage
          });
        }
      });
    },
    [patchUpload, uploadFile]
  );

  useEffect(() => {
    const activeUploads = uploads.filter((item) => item.status === "uploading").length;
    if (activeUploads >= MAX_FILE_CONCURRENCY) {
      return;
    }

    const queued = uploads.filter((item) => item.status === "queued");
    if (queued.length === 0) {
      return;
    }

    const capacity = MAX_FILE_CONCURRENCY - activeUploads;
    const startCandidates = queued.slice(0, capacity);

    for (const candidate of startCandidates) {
      patchUpload(candidate.id, { status: "uploading" });
      void startUpload(candidate);
    }
  }, [patchUpload, startUpload, uploads]);

  const pauseFile = useCallback(
    (id: string) => {
      pauseUpload(id);
      patchUpload(id, { status: "paused" });
    },
    [patchUpload, pauseUpload]
  );

  const resumeFile = useCallback(
    (id: string) => {
      patchUpload(id, {
        status: "queued",
        error: undefined
      });
    },
    [patchUpload]
  );

  const retryFile = useCallback(
    (id: string) => {
      patchUpload(id, {
        status: "queued",
        error: undefined
      });
    },
    [patchUpload]
  );

  const removeFile = useCallback(
    (id: string) => {
      pauseUpload(id);
      setUploads((current) => current.filter((item) => item.id !== id));
    },
    [pauseUpload]
  );

  const summary = useMemo(() => {
    const completed = uploads.filter((item) => item.status === "completed").length;
    const failed = uploads.filter((item) => item.status === "failed").length;
    const uploading = uploads.filter((item) => item.status === "uploading").length;

    return {
      total: uploads.length,
      completed,
      failed,
      uploading
    };
  }, [uploads]);

  return {
    uploads,
    summary,
    enqueueFiles,
    pauseFile,
    resumeFile,
    retryFile,
    removeFile
  };
}
