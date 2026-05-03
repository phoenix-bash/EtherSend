"use client";

import { useCallback, useEffect, useRef } from "react";
import type { FileUploadState } from "../types";
import {
  buildFileFingerprint,
  clearUploadSession,
  loadUploadSession,
  normalizeUploadError,
  saveUploadSession,
  uploadFileToV2
} from "../services/upload.service";

interface UploadLifecycleHandlers {
  onProgress: (value: number) => void;
  onStarted: (patch: Partial<FileUploadState>) => void;
  onCompleted: (patch: Partial<FileUploadState>) => void;
  onFailed: (errorMessage: string) => void;
  maxChunkConcurrency: number;
}

export function useFileUpload() {
  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    return () => {
      for (const controller of controllersRef.current.values()) {
        controller.abort();
      }
      controllersRef.current.clear();
    };
  }, []);

  const pauseUpload = useCallback((uploadStateId: string): void => {
    const controller = controllersRef.current.get(uploadStateId);
    if (controller) {
      controller.abort();
    }
  }, []);

  const uploadFile = useCallback(async (state: FileUploadState, handlers: UploadLifecycleHandlers): Promise<void> => {
    const existingController = controllersRef.current.get(state.id);
    if (existingController) {
      existingController.abort();
      controllersRef.current.delete(state.id);
    }

    const abortController = new AbortController();
    controllersRef.current.set(state.id, abortController);

    const fingerprint = buildFileFingerprint(state.file);
    const resumeSession = loadUploadSession(fingerprint);

    handlers.onStarted({
      status: "uploading",
      error: undefined,
      progress: state.progress,
      uploadId: resumeSession?.uploadId,
      key: resumeSession?.key,
      fileId: resumeSession?.fileId,
      completedParts: resumeSession?.completedParts ?? state.completedParts,
      completedEtags: resumeSession?.completedEtags ?? state.completedEtags
    });

    try {
      const result = await uploadFileToV2({
        file: state.file,
        signal: abortController.signal,
        maxChunkConcurrency: handlers.maxChunkConcurrency,
        resumeSession,
        onProgress: handlers.onProgress,
        onSession: (session) => {
          if (!session) {
            return;
          }

          saveUploadSession(session);
          handlers.onStarted({
            uploadId: session.uploadId,
            key: session.key,
            fileId: session.fileId,
            completedParts: session.completedParts,
            completedEtags: session.completedEtags
          });
        }
      });

      clearUploadSession(fingerprint);
      handlers.onCompleted({
        status: "completed",
        progress: 100,
        fileUrl: result.fileUrl,
        uploadId: result.uploadId,
        key: result.key,
        fileId: result.fileId,
        completedParts: result.completedParts,
        completedEtags: result.completedEtags,
        error: undefined
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        handlers.onCompleted({ status: "paused" });
      } else {
        handlers.onFailed(normalizeUploadError(error));
      }
    } finally {
      controllersRef.current.delete(state.id);
    }
  }, []);

  return {
    uploadFile,
    pauseUpload
  };
}
