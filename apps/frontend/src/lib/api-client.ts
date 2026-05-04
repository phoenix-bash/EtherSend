function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveApiBaseUrl(): string {
  const envBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (typeof window !== "undefined") {
    const isLocalHost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "::1" ||
      window.location.hostname === "[::1]";
    const isNextDevServer = window.location.port === "3000";
    const isStandardPort = !window.location.port || window.location.port === "80" || window.location.port === "443";

    if (envBaseUrl) {
      try {
        const parsed = new URL(envBaseUrl);
        if (
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "::1" ||
          parsed.hostname === "[::1]"
        ) {
          parsed.hostname = window.location.hostname;
          return trimTrailingSlashes(parsed.toString());
        }
      } catch {
        const normalizedRelativePath = envBaseUrl.startsWith("/") ? envBaseUrl : `/${envBaseUrl}`;

        // In local Next dev, relative /api points to Next itself, not backend.
        // Handle both default (3000) and auto-shifted dev ports (3001, 3002, ...).
        if (
          !isStandardPort &&
          process.env.NODE_ENV !== "production" &&
          (isNextDevServer || Number(window.location.port) >= 3000) &&
          (normalizedRelativePath === "/api" || normalizedRelativePath.startsWith("/api/"))
        ) {
          return `${window.location.protocol}//${window.location.hostname}:4000`;
        }

        return trimTrailingSlashes(`${window.location.origin}${normalizedRelativePath}`);
      }

      return trimTrailingSlashes(envBaseUrl);
    }

    // When served through a reverse proxy (including local HTTPS), stay on same-origin /api.
    if (isStandardPort) {
      return `${window.location.origin}/api`;
    }

    if (isLocalHost) {
      return `${window.location.protocol}//${window.location.hostname}:4000`;
    }

    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  if (envBaseUrl) {
    if (!/^https?:\/\//i.test(envBaseUrl) && envBaseUrl.startsWith("/") && process.env.NODE_ENV !== "production") {
      return "http://localhost:4000";
    }

    return trimTrailingSlashes(envBaseUrl);
  }

  return "http://localhost:4000";
}

export const API_BASE_URL = resolveApiBaseUrl();

const ACCESS_TOKEN_KEY = "lf_access_token";

function resolveUserTimeZone(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof timeZone === "string" && timeZone.trim().length > 0 ? timeZone : undefined;
}

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
    this.name = "ApiError";
  }
}

export function extractApiErrorCode(error: ApiError): string | undefined {
  if (!error.details || typeof error.details !== "object") {
    return undefined;
  }

  const maybeCode = (error.details as { code?: unknown }).code;
  return typeof maybeCode === "string" ? maybeCode : undefined;
}

export function resolveSecurityTeaseMessage(error: ApiError): string | null {
  const code = extractApiErrorCode(error);

  if (code === "SHARE_PASSWORD_INVALID") {
    return "Nope. Nice guess, but that password is wrong.";
  }

  if (code === "RATE_LIMITED") {
    return "Easy there, speed-runner. Cooldown active.";
  }

  if (code === "CSRF_BLOCKED") {
    return "That move is blocked. Try a legit request path.";
  }

  return null;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  role: "ADMIN" | "USER";
}

export interface EmailAuthResult {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface EmailSignupResult {
  ok: boolean;
  requiresVerification: boolean;
}

export interface AccountInfo {
  id: string;
  email: string;
  name?: string | null;
  role: "ADMIN" | "USER";
  accountType: "FREE_6M" | "SUBSCRIPTION";
  planName?: string | null;
  planValidUntil?: string | null;
  defaultMediaValidityEndsAt: string;
}

export interface ActiveSessionItem {
  id: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  browser?: string | null;
  os?: string | null;
  deviceType?: string | null;
  deviceModel?: string | null;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  current: boolean;
}

export interface MediaItem {
  id: string;
  filename: string;
  mimeType: string;
  extension?: string | null;
  sizeBytes: string;
  isActive: boolean;
  allowDownload: boolean;
  expiresAt?: string | null;
  updatedAt: string;
}

export interface ImageLinkResult {
  link: {
    id: string;
    expiresAt: string;
  };
  directUrl: string;
}

export interface StorageLimits {
  guestStorageCapBytes: number;
  signedInStorageCapBytes: number;
}

export interface QrResult {
  token: string;
  expiresAt: string;
  redirectUrl: string;
  qrDataUrl: string;
}

export interface CreatedBatch {
  id: string;
  name?: string | null;
  ownerType: "USER" | "GUEST";
  mediaIds: string[];
  createdAt: string;
}

export interface BatchShareResult {
  token: string;
  allowDownload: boolean;
  hideFilenames: boolean;
  hasPassword: boolean;
  previewViewLimit: number | null;
  expiresAt: string;
  publicPath: string;
  publicUrl?: string;
}

export interface BatchListItem {
  id: string;
  name?: string | null;
  createdAt: string;
  fileCount: number;
  share: {
    token: string;
    allowDownload: boolean;
    hideFilenames: boolean;
    expiresAt: string;
    publicPath: string;
    publicUrl?: string;
  } | null;
}

export interface PublicShareFile {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: string;
  viewPath: string;
  downloadPath: string;
}

export interface PublicBatchShare {
  token: string;
  allowDownload: boolean;
  hideFilenames: boolean;
  hasPassword: boolean;
  previewViewLimit: number | null;
  expiresAt: string;
  sharedBy: string;
  batch: {
    id: string;
    name?: string | null;
    files: PublicShareFile[];
  };
}

export interface ActivityFeedItem {
  id: string;
  kind: "asset_uploaded" | "batch_shared" | "batch_viewed";
  message: string;
  level: "info" | "success" | "warning";
  createdAt: string;
}

const V2_UPLOAD_RETRY_BACKOFF_MS = [1000, 2000, 4000];
const V2_UPLOAD_MAX_CHUNK_CONCURRENCY = 5;

export function setAccessToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function clearAccessToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}

function parseJwtPayload(token: string): { exp?: number } | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payloadBase64 + "=".repeat((4 - (payloadBase64.length % 4)) % 4);
    const payloadJson = atob(padded);
    const payload = JSON.parse(payloadJson) as { exp?: unknown };

    if (payload.exp !== undefined && typeof payload.exp !== "number") {
      return null;
    }

    return payload as { exp?: number };
  } catch {
    return null;
  }
}

function getUsableAccessToken(): string | null {
  const token = getAccessToken();
  if (!token) {
    return null;
  }

  const payload = parseJwtPayload(token);
  if (!payload) {
    clearAccessToken();
    return null;
  }

  // Drop token slightly before expiry to avoid request races that return 401.
  if (typeof payload.exp === "number" && payload.exp * 1000 <= Date.now() + 5000) {
    clearAccessToken();
    return null;
  }

  return token;
}

function buildHeaders(init?: RequestInit): HeadersInit {
  const headers: Record<string, string> = {};

  const token = getUsableAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return {
    ...headers,
    ...(init?.headers ?? {})
  };
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = buildHeaders(init) as Record<string, string>;
  if (init?.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string; details?: unknown } | null;
    throw new ApiError(
      response.status,
      payload?.error ?? `API request failed with status ${response.status}`,
      payload?.details
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: "{}"
    });

    if (!response.ok) {
      clearAccessToken();
      return null;
    }

    const payload = (await response.json()) as { accessToken?: string };
    if (!payload.accessToken) {
      clearAccessToken();
      return null;
    }

    setAccessToken(payload.accessToken);
    return payload.accessToken;
  } catch {
    clearAccessToken();
    return null;
  }
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  let token = getUsableAccessToken();
  if (!token) {
    token = await refreshAccessToken();
    if (!token) {
      return null;
    }
  }

  try {
    const result = await apiRequest<{ user: AuthUser | null }>("/auth/me");
    return result.user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      const refreshedToken = await refreshAccessToken();
      if (!refreshedToken) {
        return null;
      }

      try {
        const retried = await apiRequest<{ user: AuthUser | null }>("/auth/me");
        return retried.user;
      } catch {
        clearAccessToken();
      }
    }

    return null;
  }
}

export function signupWithEmail(input: { email: string; password: string; name?: string }): Promise<EmailSignupResult> {
  return apiRequest<EmailSignupResult>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function signinWithEmail(input: { email: string; password: string }): Promise<EmailAuthResult> {
  const result = await apiRequest<EmailAuthResult>("/auth/signin", {
    method: "POST",
    body: JSON.stringify(input)
  });

  setAccessToken(result.accessToken);
  return result;
}

export function verifyEmailToken(token: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token })
  });
}

export function requestPasswordReset(email: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export function resetPasswordWithToken(input: { token: string; password: string }): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function fetchAccountInfo(): Promise<AccountInfo | null> {
  if (!getUsableAccessToken()) {
    return null;
  }

  try {
    const result = await apiRequest<{ account: AccountInfo | null }>("/auth/account");
    return result.account;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearAccessToken();
    }

    return null;
  }
}

export function listActiveSessions(): Promise<{ items: ActiveSessionItem[] }> {
  return apiRequest<{ items: ActiveSessionItem[] }>("/auth/sessions");
}

export function revokeActiveSession(sessionId: string): Promise<{ ok: boolean; currentSessionRevoked: boolean }> {
  return apiRequest<{ ok: boolean; currentSessionRevoked: boolean }>(`/auth/sessions/${sessionId}`, {
    method: "DELETE"
  });
}

export function requestAccountDeletionVerification(confirmation: string): Promise<{ ok: boolean }> {
  const timeZone = resolveUserTimeZone();
  return apiRequest<{ ok: boolean }>("/auth/account/delete-verification", {
    method: "POST",
    body: JSON.stringify({ confirmation, timeZone })
  });
}

export function deleteAccountPermanently(confirmation: string, verificationCode: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/auth/account", {
    method: "DELETE",
    body: JSON.stringify({ confirmation, verificationCode })
  });
}

function isV2PrimaryUploadEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_V2_UPLOAD === "true";
}

function isV2LegacyFallbackEnabled(): boolean {
  return process.env.NEXT_PUBLIC_V2_UPLOAD_FALLBACK_TO_V1 === "true";
}

function resolveV2ApiPath(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (API_BASE_URL.endsWith("/api")) {
    return `/v2${normalizedPath}`;
  }

  return `/api/v2${normalizedPath}`;
}

async function withV2Retry<T>(operation: () => Promise<T>): Promise<T> {
  const maxAttempts = V2_UPLOAD_RETRY_BACKOFF_MS.length + 1;
  let attempt = 0;

  while (attempt < maxAttempts) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts - 1) {
        throw error;
      }

      await new Promise((resolve) => window.setTimeout(resolve, V2_UPLOAD_RETRY_BACKOFF_MS[attempt]));
      attempt += 1;
    }
  }

  throw new Error("Upload retry loop terminated unexpectedly.");
}

async function putToSignedUrl(url: string, blob: Blob, contentType?: string): Promise<{ etag?: string }> {
  const response = await fetch(url, {
    method: "PUT",
    headers: contentType ? { "Content-Type": contentType } : undefined,
    body: blob
  });

  if (!response.ok) {
    throw new Error(`Signed URL upload failed with status ${response.status}`);
  }

  return {
    etag: response.headers.get("ETag") ?? undefined
  };
}

interface V2UploadInitDirectResponse {
  fileId: string;
  uploadId: null;
  useMultipart: false;
  signedUrl: string;
  key: string;
}

interface V2UploadInitMultipartResponse {
  fileId: string;
  uploadId: string;
  useMultipart: true;
  chunkSize: number;
  signedUrls: string[];
  key: string;
}

type V2UploadInitResponse = V2UploadInitDirectResponse | V2UploadInitMultipartResponse;

interface V2UploadCompleteResponse {
  success: true;
  fileId: string;
  fileUrl: string;
  media?: MediaItem;
}

async function uploadMediaViaV2(file: File): Promise<{ media: MediaItem }> {
  const init = await apiRequest<V2UploadInitResponse>(resolveV2ApiPath("/upload/init"), {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream"
    })
  });

  if (!init.useMultipart) {
    await withV2Retry(async () => {
      await putToSignedUrl(init.signedUrl, file, file.type || "application/octet-stream");
    });

    const completed = await apiRequest<V2UploadCompleteResponse>(resolveV2ApiPath("/upload/complete"), {
      method: "POST",
      body: JSON.stringify({
        fileId: init.fileId,
        key: init.key,
        uploadId: null,
        parts: []
      })
    });

    if (!completed.media) {
      throw new Error("V2 upload completed without media metadata.");
    }

    return { media: completed.media };
  }

  const chunkSize = init.chunkSize;
  const totalParts = Math.ceil(file.size / chunkSize);
  const completedParts = new Map<number, string>();
  const pendingPartNumbers: number[] = [];

  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    pendingPartNumbers.push(partNumber);
  }

  const uploadPart = async (partNumber: number): Promise<void> => {
    const start = (partNumber - 1) * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const blob = file.slice(start, end);

    await withV2Retry(async () => {
      let signedUrl = init.signedUrls[partNumber - 1];
      if (!signedUrl) {
        const chunk = await apiRequest<{ url: string; partNumber: number }>(resolveV2ApiPath("/upload/chunk"), {
          method: "POST",
          body: JSON.stringify({
            uploadId: init.uploadId,
            key: init.key,
            partNumber
          })
        });
        signedUrl = chunk.url;
      }

      try {
        const result = await putToSignedUrl(signedUrl, blob);
        const etag = result.etag?.trim();
        if (!etag) {
          throw new Error("Missing ETag for uploaded part.");
        }
        completedParts.set(partNumber, etag);
      } catch (error) {
        const chunk = await apiRequest<{ url: string; partNumber: number }>(resolveV2ApiPath("/upload/chunk"), {
          method: "POST",
          body: JSON.stringify({
            uploadId: init.uploadId,
            key: init.key,
            partNumber
          })
        });

        const retryResult = await putToSignedUrl(chunk.url, blob);
        const retryEtag = retryResult.etag?.trim();
        if (!retryEtag) {
          throw error;
        }

        completedParts.set(partNumber, retryEtag);
      }
    });
  };

  const workerCount = Math.max(1, Math.min(V2_UPLOAD_MAX_CHUNK_CONCURRENCY, pendingPartNumbers.length));
  let pointer = 0;

  const workers = Array.from({ length: workerCount }, async () => {
    while (pointer < pendingPartNumbers.length) {
      const current = pointer;
      pointer += 1;
      await uploadPart(pendingPartNumbers[current]);
    }
  });

  try {
    await Promise.all(workers);
  } catch (error) {
    await apiRequest<{ success: true }>(resolveV2ApiPath("/upload/abort"), {
      method: "POST",
      body: JSON.stringify({
        uploadId: init.uploadId,
        key: init.key
      })
    }).catch(() => undefined);

    throw error;
  }

  const parts = Array.from(completedParts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([PartNumber, ETag]) => ({ PartNumber, ETag }));

  const completed = await apiRequest<V2UploadCompleteResponse>(resolveV2ApiPath("/upload/complete"), {
    method: "POST",
    body: JSON.stringify({
      fileId: init.fileId,
      key: init.key,
      uploadId: init.uploadId,
      parts
    })
  });

  if (!completed.media) {
    throw new Error("V2 upload completed without media metadata.");
  }

  return { media: completed.media };
}

async function uploadFile(path: string, file: File): Promise<{ media: MediaItem }> {
  const formData = new FormData();
  formData.append("file", file);

  const token = getUsableAccessToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers,
    body: formData
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, payload?.error ?? `Upload failed with status ${response.status}`);
  }

  return response.json() as Promise<{ media: MediaItem }>;
}

export async function uploadMedia(file: File): Promise<{ media: MediaItem }> {
  if (!isV2PrimaryUploadEnabled()) {
    return uploadFile("/media/upload", file);
  }

  try {
    return await uploadMediaViaV2(file);
  } catch (error) {
    if (isV2LegacyFallbackEnabled()) {
      return uploadFile("/media/upload", file);
    }

    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new ApiError(500, error.message);
    }

    throw new ApiError(500, "Upload failed");
  }
}

export function replaceMedia(mediaId: string, file: File): Promise<{ media: MediaItem }> {
  return uploadFile(`/media/${mediaId}/replace`, file);
}

export function listMedia(): Promise<{ items: MediaItem[] }> {
  return apiRequest<{ items: MediaItem[] }>("/media");
}

export function getStorageLimits(): Promise<StorageLimits> {
  return apiRequest<StorageLimits>("/limits");
}

export function toggleMedia(mediaId: string, payload: { isActive?: boolean; allowDownload?: boolean }) {
  return apiRequest<{ media: MediaItem }>(`/media/${mediaId}/toggles`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteMedia(mediaId: string): Promise<void> {
  await apiRequest<unknown>(`/media/${mediaId}`, {
    method: "DELETE"
  });
}

export function createImageLink(mediaId: string): Promise<ImageLinkResult> {
  return apiRequest<ImageLinkResult>(`/images/${mediaId}/link`, { method: "POST" });
}

export function createQr(mediaId: string): Promise<QrResult> {
  return apiRequest<QrResult>(`/qr/${mediaId}`, { method: "POST" });
}

export function createBatch(mediaIds: string[], name?: string): Promise<{ batch: CreatedBatch }> {
  return apiRequest<{ batch: CreatedBatch }>("/batches", {
    method: "POST",
    body: JSON.stringify({ mediaIds, name })
  });
}

export function listBatches(): Promise<{ items: BatchListItem[] }> {
  return apiRequest<{ items: BatchListItem[] }>("/batches");
}

export async function deleteBatch(batchId: string): Promise<void> {
  await apiRequest<unknown>(`/batches/${batchId}`, {
    method: "DELETE"
  });
}

export function listActivity(limit = 20): Promise<{ items: ActivityFeedItem[] }> {
  const resolvedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return apiRequest<{ items: ActivityFeedItem[] }>(`/activity?limit=${resolvedLimit}`);
}

export function createOrRefreshBatchShare(
  batchId: string,
  allowDownload?: boolean,
  hideFilenames?: boolean,
  password?: string,
  previewViewLimit?: number,
  customExpiry?: { expiresAt?: string; durationMinutes?: number }
): Promise<{ share: BatchShareResult }> {
  return apiRequest<{ share: BatchShareResult }>(`/batches/${batchId}/share`, {
    method: "POST",
    body: JSON.stringify({
      allowDownload,
      hideFilenames,
      password,
      previewViewLimit,
      expiresAt: customExpiry?.expiresAt,
      durationMinutes: customExpiry?.durationMinutes
    })
  });
}

export function updateBatchShare(
  batchId: string,
  allowDownload: boolean,
  hideFilenames?: boolean,
  password?: string,
  previewViewLimit?: number
): Promise<{ share: BatchShareResult }> {
  return apiRequest<{ share: BatchShareResult }>(`/batches/${batchId}/share`, {
    method: "PATCH",
    body: JSON.stringify({ allowDownload, hideFilenames, password, previewViewLimit })
  });
}

export function sendBatchShareEmail(batchId: string, recipientEmail: string): Promise<{ ok: boolean; expiresAt: string; hasPassword: boolean }> {
  const timeZone = resolveUserTimeZone();
  return apiRequest<{ ok: boolean; expiresAt: string; hasPassword: boolean }>(`/batches/${batchId}/share/email`, {
    method: "POST",
    body: JSON.stringify({ recipientEmail, timeZone })
  });
}

export interface DominatorOverview {
  users: {
    totalRegistered: number;
    totalGuests: number;
    totalOverall: number;
    activeUsers: number;
    activeGuests: number;
    activeLoggedInUsers: number;
  };
  files: {
    totalUploadedFiles: number;
    totalActiveSharedLinks: number;
    totalStorageBytes: string;
    storageBreakdown: {
      imagesBytes: string;
      videosBytes: string;
      documentsBytes: string;
      othersBytes: string;
    };
  };
  system: {
    serverUptimeSeconds: number;
    databaseSizeBytes: string;
    activeSessions: number;
    recentUploadsCount: number;
    recentRegistrationsCount: number;
  };
}

export function requestDominatorActivationToken(): Promise<{ token: string; expiresInSeconds: number }> {
  return apiRequest<{ token: string; expiresInSeconds: number }>("/dominator/access/ignite", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function consumeDominatorActivationToken(token: string): Promise<{ challengeToken: string }> {
  return apiRequest<{ challengeToken: string }>("/dominator/access/consume", {
    method: "POST",
    body: JSON.stringify({ token })
  });
}

export function createDominatorSession(email: string, password: string, challengeToken: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/dominator/session", {
    method: "POST",
    body: JSON.stringify({ email, password, challengeToken })
  });
}

export function fetchDominatorSession(): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/dominator/session/me");
}

export function logoutDominatorSession(): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/dominator/session", {
    method: "DELETE"
  });
}

export function fetchDominatorOverview(): Promise<{ overview: DominatorOverview }> {
  return apiRequest<{ overview: DominatorOverview }>("/dominator/overview");
}

export function searchDominatorUsers(query?: string, page = 1, pageSize = 20): Promise<{
  total: number;
  items: Array<{ id: string; email: string; name: string | null; createdAt: string }>;
}> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (query && query.trim()) {
    params.set("query", query.trim());
  }

  return apiRequest(`/dominator/users?${params.toString()}`);
}

export function fetchDominatorUser(userId: string): Promise<{
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    storageBytes: string;
    uploadedFilesCount: number;
    activeLinksCount: number;
    lastLoginAt: string | null;
    ipHistory: string[];
    accountType: string;
  };
}> {
  return apiRequest(`/dominator/users/${userId}`);
}

export function fetchDominatorUserFiles(userId: string, page = 1, pageSize = 20): Promise<{
  total: number;
  items: Array<{
    id: string;
    filename: string;
    mimeType: string;
    sizeBytes: string;
    createdAt: string;
    expiresAt: string | null;
    isActive: boolean;
  }>;
}> {
  return apiRequest(`/dominator/users/${userId}/files?page=${page}&pageSize=${pageSize}`);
}

export function deleteDominatorUser(userId: string, superuserPassword: string): Promise<{ ok: boolean }> {
  return apiRequest(`/dominator/users/${userId}`, {
    method: "DELETE",
    body: JSON.stringify({ superuserPassword })
  });
}

export function deleteDominatorFile(mediaId: string, superuserPassword: string): Promise<{ ok: boolean }> {
  return apiRequest(`/dominator/files/${mediaId}`, {
    method: "DELETE",
    body: JSON.stringify({ superuserPassword })
  });
}

export function fetchDominatorLiveActivity(): Promise<{ activity: { onlineUsers: number; uploadingUsers: number; activeSessions: number; activeGuests: number } }> {
  return apiRequest("/dominator/live-activity");
}

export function fetchDominatorAuditLogs(take = 100): Promise<{
  logs: Array<{ id: string; action: string; status: string; ipAddress: string | null; targetUserId: string | null; createdAt: string }>;
}> {
  return apiRequest(`/dominator/audit-logs?take=${take}`);
}

export function fetchPublicBatchShare(token: string, password?: string): Promise<PublicBatchShare> {
  return apiRequest<PublicBatchShare>(`/shares/${token}`, {
    headers: password ? { "x-share-password": password } : undefined
  });
}

export function shareFilePath(token: string, mediaId: string, disposition: "view" | "download" = "view"): string {
  const query = disposition === "download" ? "?disposition=download" : "";
  return `/shares/${token}/files/${mediaId}${query}`;
}

export function shareFileOfficePagesPath(token: string, mediaId: string): string {
  return `/shares/${token}/files/${mediaId}/office-pages`;
}

export function mediaViewUrl(mediaId: string): string {
  return `${API_BASE_URL}/m/${mediaId}`;
}

export function mediaOfficePagesUrl(mediaId: string): string {
  return `${API_BASE_URL}/m/${mediaId}/office-pages`;
}

export function mediaPdfPagesUrl(mediaId: string): string {
  return `${API_BASE_URL}/m/${mediaId}/pdf-pages`;
}

export function mediaDownloadUrl(mediaId: string): string {
  return `${API_BASE_URL}/m/${mediaId}?disposition=download`;
}

export function absoluteApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const resolvedApiBaseUrl = (() => {
    if (/^https?:\/\//i.test(API_BASE_URL)) {
      return API_BASE_URL;
    }

    const normalizedBase = API_BASE_URL.startsWith("/") ? API_BASE_URL : `/${API_BASE_URL}`;
    if (typeof window !== "undefined") {
      return `${window.location.origin}${normalizedBase}`;
    }

    return `http://localhost:4000${normalizedBase}`;
  })();

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimTrailingSlashes(resolvedApiBaseUrl)}${normalizedPath}`;
}

export async function logoutSession(): Promise<void> {
  try {
    await apiRequest<{ ok: boolean }>("/auth/logout", { method: "POST" });
  } catch {
    // Local sign-out should proceed even if API logout fails.
  } finally {
    clearAccessToken();
  }
}
