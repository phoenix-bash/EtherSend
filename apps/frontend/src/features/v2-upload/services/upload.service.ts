import { ApiError } from "../../../lib/api-client";
import { v2ApiRequest } from "./api.client";
import type {
  ChunkUrlResponse,
  PersistedUploadSession,
  UploadCompleteResponse,
  UploadInitResponse
} from "../types";

const RETRY_BACKOFF_MS = [1000, 2000, 4000];
const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024;
const SESSION_STORAGE_KEY = "lf_v2_upload_sessions";

interface UploadFileOptions {
  file: File;
  signal: AbortSignal;
  maxChunkConcurrency: number;
  resumeSession?: PersistedUploadSession;
  onProgress: (progress: number) => void;
  onSession: (session: PersistedUploadSession | null) => void;
}

interface UploadFileResult {
  fileId: string;
  key: string;
  uploadId?: string;
  completedParts: number[];
  completedEtags: Record<number, string>;
  fileUrl: string;
  media?: UploadCompleteResponse["media"];
}

type XhrUploadResult = {
  etag?: string;
};

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function xhrPutBlob(input: {
  url: string;
  blob: Blob;
  signal: AbortSignal;
  contentType?: string;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<XhrUploadResult> {
  return new Promise<XhrUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    const cleanup = (): void => {
      input.signal.removeEventListener("abort", onAbort);
    };

    const onAbort = (): void => {
      xhr.abort();
    };

    input.signal.addEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !input.onProgress) {
        return;
      }

      input.onProgress(event.loaded, event.total);
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error("Network error while uploading to signed URL."));
    };

    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("Upload was aborted.", "AbortError"));
    };

    xhr.onload = () => {
      cleanup();

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          etag: xhr.getResponseHeader("ETag") ?? undefined
        });
        return;
      }

      reject(new Error(`Signed URL upload failed with status ${xhr.status}`));
    };

    xhr.open("PUT", input.url, true);

    if (input.contentType) {
      xhr.setRequestHeader("Content-Type", input.contentType);
    }

    xhr.send(input.blob);
  });
}

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  const maxAttempts = RETRY_BACKOFF_MS.length + 1;
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      return await operation();
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      if (attempt >= maxAttempts - 1) {
        throw error;
      }

      await sleep(RETRY_BACKOFF_MS[attempt]);
      attempt += 1;
    }
  }

  throw new Error("Retry loop terminated unexpectedly.");
}

async function requestChunkUrl(uploadId: string, key: string, partNumber: number): Promise<string> {
  const response = await v2ApiRequest<ChunkUrlResponse>("/upload/chunk", {
    method: "POST",
    body: JSON.stringify({ uploadId, key, partNumber })
  });

  return response.url;
}

async function initUpload(file: File): Promise<UploadInitResponse> {
  return v2ApiRequest<UploadInitResponse>("/upload/init", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream"
    })
  });
}

async function completeUpload(input: {
  fileId: string;
  key: string;
  uploadId?: string;
  parts?: Array<{ PartNumber: number; ETag: string }>;
}): Promise<UploadCompleteResponse> {
  return v2ApiRequest<UploadCompleteResponse>("/upload/complete", {
    method: "POST",
    body: JSON.stringify({
      fileId: input.fileId,
      key: input.key,
      uploadId: input.uploadId ?? null,
      parts: input.parts ?? []
    })
  });
}

export async function abortMultipartUpload(uploadId: string, key: string): Promise<void> {
  try {
    await v2ApiRequest<{ success: true }>("/upload/abort", {
      method: "POST",
      body: JSON.stringify({ uploadId, key })
    });
  } catch {
    // Best-effort abort should not crash the UI path.
  }
}

function calculatePartSize(fileSize: number, partNumber: number, chunkSize: number): number {
  const start = (partNumber - 1) * chunkSize;
  const end = Math.min(fileSize, start + chunkSize);
  return Math.max(0, end - start);
}

export function buildFileFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
}

function readSessionMap(): Record<string, PersistedUploadSession> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, PersistedUploadSession>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeSessionMap(value: Record<string, PersistedUploadSession>): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(value));
}

export function loadUploadSession(fingerprint: string): PersistedUploadSession | undefined {
  return readSessionMap()[fingerprint];
}

export function saveUploadSession(session: PersistedUploadSession): void {
  const map = readSessionMap();
  map[session.fingerprint] = session;
  writeSessionMap(map);
}

export function clearUploadSession(fingerprint: string): void {
  const map = readSessionMap();
  delete map[fingerprint];
  writeSessionMap(map);
}

async function uploadDirect(input: {
  file: File;
  signal: AbortSignal;
  signedUrl: string;
  fileId: string;
  key: string;
  onProgress: (value: number) => void;
}): Promise<UploadFileResult> {
  await withRetry(async () => {
    await xhrPutBlob({
      url: input.signedUrl,
      blob: input.file,
      signal: input.signal,
      contentType: input.file.type || "application/octet-stream",
      onProgress: (loaded, total) => {
        const ratio = total > 0 ? loaded / total : 0;
        input.onProgress(Math.min(99, Math.round(ratio * 100)));
      }
    });
  });

  const completed = await completeUpload({
    fileId: input.fileId,
    key: input.key
  });

  input.onProgress(100);

  return {
    fileId: input.fileId,
    key: input.key,
    completedParts: [],
    completedEtags: {},
    fileUrl: completed.fileUrl,
    media: completed.media
  };
}

async function uploadMultipart(input: {
  file: File;
  signal: AbortSignal;
  fileId: string;
  key: string;
  uploadId: string;
  signedUrls?: string[];
  chunkSize?: number;
  maxChunkConcurrency: number;
  existingCompletedParts: number[];
  existingEtags: Record<number, string>;
  onProgress: (value: number) => void;
  onSession: (session: PersistedUploadSession) => void;
}): Promise<UploadFileResult> {
  const chunkSize = input.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const totalParts = Math.ceil(input.file.size / chunkSize);
  const completedPartSet = new Set<number>(input.existingCompletedParts);
  const completedEtags: Record<number, string> = { ...input.existingEtags };

  const inFlightPartProgress = new Map<number, number>();

  let completedBytes = 0;
  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    if (completedPartSet.has(partNumber)) {
      completedBytes += calculatePartSize(input.file.size, partNumber, chunkSize);
    }
  }

  const refreshProgress = (): void => {
    const inFlightBytes = Array.from(inFlightPartProgress.values()).reduce((sum, value) => sum + value, 0);
    const ratio = input.file.size > 0 ? (completedBytes + inFlightBytes) / input.file.size : 0;
    input.onProgress(Math.min(99, Math.round(ratio * 100)));
  };

  const pendingParts: number[] = [];
  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    if (!completedPartSet.has(partNumber)) {
      pendingParts.push(partNumber);
    }
  }

  const resolveSignedUrl = async (partNumber: number): Promise<string> => {
    const fromInit = input.signedUrls?.[partNumber - 1];
    if (fromInit) {
      return fromInit;
    }

    return requestChunkUrl(input.uploadId, input.key, partNumber);
  };

  input.onSession({
    fingerprint: buildFileFingerprint(input.file),
    fileId: input.fileId,
    key: input.key,
    uploadId: input.uploadId,
    completedParts: Array.from(completedPartSet).sort((a, b) => a - b),
    completedEtags,
    updatedAt: Date.now()
  });

  let pointer = 0;
  const workerCount = Math.max(1, Math.min(input.maxChunkConcurrency, pendingParts.length));

  const workers = Array.from({ length: workerCount }, async () => {
    while (pointer < pendingParts.length) {
      const current = pointer;
      pointer += 1;
      const partNumber = pendingParts[current];
      const start = (partNumber - 1) * chunkSize;
      const end = Math.min(input.file.size, start + chunkSize);
      const blob = input.file.slice(start, end);
      const partSize = blob.size;

      const result = await withRetry(async () => {
        const signedUrl = await resolveSignedUrl(partNumber);

        try {
          return await xhrPutBlob({
            url: signedUrl,
            blob,
            signal: input.signal,
            onProgress: (loaded) => {
              inFlightPartProgress.set(partNumber, loaded);
              refreshProgress();
            }
          });
        } catch (error) {
          if (error instanceof Error && error.message.includes("403")) {
            await requestChunkUrl(input.uploadId, input.key, partNumber);
          }

          throw error;
        }
      });

      inFlightPartProgress.delete(partNumber);
      completedBytes += partSize;
      completedPartSet.add(partNumber);
      completedEtags[partNumber] = result.etag ?? "";

      const session: PersistedUploadSession = {
        fingerprint: buildFileFingerprint(input.file),
        fileId: input.fileId,
        key: input.key,
        uploadId: input.uploadId,
        completedParts: Array.from(completedPartSet).sort((a, b) => a - b),
        completedEtags,
        updatedAt: Date.now()
      };

      input.onSession(session);
      refreshProgress();
    }
  });

  await Promise.all(workers);

  const completionParts = Array.from(completedPartSet)
    .sort((a, b) => a - b)
    .map((partNumber) => ({
      PartNumber: partNumber,
      ETag: completedEtags[partNumber]
    }))
    .filter((part) => Boolean(part.ETag));

  const completed = await completeUpload({
    fileId: input.fileId,
    key: input.key,
    uploadId: input.uploadId,
    parts: completionParts
  });

  input.onProgress(100);

  return {
    fileId: input.fileId,
    key: input.key,
    uploadId: input.uploadId,
    completedParts: completionParts.map((item) => item.PartNumber),
    completedEtags,
    fileUrl: completed.fileUrl,
    media: completed.media
  };
}

export async function uploadFileToV2(input: UploadFileOptions): Promise<UploadFileResult> {
  const resumed = input.resumeSession;

  let initResult: UploadInitResponse;

  if (resumed?.uploadId && resumed.fileId && resumed.key) {
    initResult = {
      fileId: resumed.fileId,
      uploadId: resumed.uploadId,
      useMultipart: true,
      chunkSize: DEFAULT_CHUNK_SIZE,
      signedUrls: [],
      key: resumed.key
    };
  } else {
    initResult = await initUpload(input.file);
  }

  if (!initResult.useMultipart) {
    return uploadDirect({
      file: input.file,
      signal: input.signal,
      signedUrl: initResult.signedUrl,
      fileId: initResult.fileId,
      key: initResult.key,
      onProgress: input.onProgress
    });
  }

  return uploadMultipart({
    file: input.file,
    signal: input.signal,
    fileId: initResult.fileId,
    key: initResult.key,
    uploadId: initResult.uploadId,
    signedUrls: initResult.signedUrls,
    chunkSize: initResult.chunkSize,
    maxChunkConcurrency: input.maxChunkConcurrency,
    existingCompletedParts: resumed?.completedParts ?? [],
    existingEtags: resumed?.completedEtags ?? {},
    onProgress: input.onProgress,
    onSession: input.onSession
  });
}

export function normalizeUploadError(error: unknown): string {
  if (isAbortError(error)) {
    return "Upload paused.";
  }

  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Upload failed.";
}
