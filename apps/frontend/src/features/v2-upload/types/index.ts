export type UploadStatus = "queued" | "uploading" | "completed" | "failed" | "paused";

export interface FileUploadState {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  uploadId?: string;
  key?: string;
  fileId?: string;
  completedParts: number[];
  error?: string;
  fileUrl?: string;
  completedEtags?: Record<number, string>;
}

export interface UploadInitRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  userId?: string;
}

export interface UploadInitDirectResponse {
  fileId: string;
  uploadId: null;
  useMultipart: false;
  signedUrl: string;
  key: string;
}

export interface UploadInitMultipartResponse {
  fileId: string;
  uploadId: string;
  useMultipart: true;
  chunkSize: number;
  signedUrls: string[];
  key: string;
}

export type UploadInitResponse = UploadInitDirectResponse | UploadInitMultipartResponse;

export interface UploadCompleteResponse {
  success: true;
  fileId: string;
  fileUrl: string;
  media?: {
    id: string;
    filename: string;
    mimeType: string;
    extension?: string | null;
    sizeBytes: string;
    isActive: boolean;
    allowDownload: boolean;
    expiresAt?: string | null;
    updatedAt: string;
  };
  metadata: {
    status: "completed";
    completedAt: string;
    useMultipart: boolean;
    sizeBytes: string;
    mimeType: string | null;
  };
}

export interface ChunkUrlResponse {
  url: string;
  partNumber: number;
}

export interface PersistedUploadSession {
  fingerprint: string;
  fileId: string;
  key: string;
  uploadId?: string;
  completedParts: number[];
  completedEtags: Record<number, string>;
  updatedAt: number;
}
