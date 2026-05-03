export const DIRECT_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024;
export const MULTIPART_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;
export const S3_MULTIPART_MAX_PARTS = 10000;

export type UploadActor = {
  userId: string;
  isGuest: boolean;
  guestSessionId?: string;
};

export type UploadPart = {
  PartNumber: number;
  ETag: string;
};

export interface UploadInitRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  userId?: string;
}

export interface UploadInitResponseDirect {
  fileId: string;
  uploadId: null;
  useMultipart: false;
  signedUrl: string;
  key: string;
}

export interface UploadInitResponseMultipart {
  fileId: string;
  uploadId: string;
  useMultipart: true;
  chunkSize: number;
  signedUrls: string[];
  key: string;
}

export type UploadInitResponse = UploadInitResponseDirect | UploadInitResponseMultipart;

export interface UploadCompleteRequest {
  uploadId?: string | null;
  key: string;
  fileId: string;
  parts?: UploadPart[];
}

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

export interface UploadAbortRequest {
  uploadId: string;
  key: string;
}

export interface UploadChunkRequest {
  uploadId: string;
  partNumber: number;
  key: string;
}

export interface UploadChunkResponse {
  url: string;
  partNumber: number;
}
